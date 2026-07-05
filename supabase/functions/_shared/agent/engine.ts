// SOURCE OF TRUTH: src/lib/agent/engine.ts in the Next.js app.
// Vendored into the Edge Function. KEEP IN SYNC.

import {
  SEVERE_PHRASES,
  SEVERE_WORDS,
  MODERATE_WORDS,
  MILD_WORDS,
  FLAG_IMMEDIATE,
} from "./lexicon.ts";
import { normalize, normalizeAggressive, tokenize, driftDistance } from "./text.ts";
import type { ConstitutionDirectives } from "./constitution.ts";

export type Calibration = {
  heat_nudge: number;
  heat_collapse: number;
  heat_flag: number;
  drift_nudge: number;
  dogpile_count: number;
  learning_rate: number;
};

export type ContentMetrics = {
  heat: number;
  drift: number | null;
  lexiconHits: string[];
  directed: boolean;
  capsRatio: number;
  forbiddenHits: string[];
  immediateFlag: boolean;
  contentTokens: number;
};

export type AgentDecision = {
  action: "nudge" | "collapse" | "flag";
  trigger:
    | "heat_nudge"
    | "heat_collapse"
    | "heat_flag"
    | "drift_nudge"
    | "dogpile_count";
  reason: string;
};

export function analyzeContent(
  text: string,
  directives: ConstitutionDirectives,
  contextText: string | null,
): ContentMetrics {
  const norm = normalize(text);
  // Aggressive normalization for lexicon matching only — see app source.
  const lexNorm = normalizeAggressive(text);
  const tokens = tokenize(text);
  const lexTokens = lexNorm.split(" ").filter((t) => t.length >= 2);
  const tokenSet = new Set(tokens);
  const lexTokenSet = new Set(lexTokens);

  let sum = 0;
  const hits: string[] = [];

  for (const [phrase, w] of Object.entries(SEVERE_PHRASES)) {
    if (lexNorm.includes(phrase)) {
      sum += w;
      hits.push(phrase);
    }
  }
  for (const dict of [SEVERE_WORDS, MODERATE_WORDS, MILD_WORDS]) {
    for (const [word, w] of Object.entries(dict)) {
      if (tokenSet.has(word) || lexTokenSet.has(word)) {
        sum += w;
        hits.push(word);
      }
    }
  }

  const immediateFlag = lexTokens.some((t) => FLAG_IMMEDIATE.has(t));

  const directed = /\b(you|your|youre|u|ur)\b/.test(norm) && sum > 0;
  if (directed) sum *= 1.35;

  let heat = 1 - Math.exp(-sum);

  const letters = text.replace(/[^a-zA-Z]/g, "");
  const capsRatio =
    letters.length > 10
      ? letters.replace(/[^A-Z]/g, "").length / letters.length
      : 0;
  if (capsRatio > 0.4) heat += 0.12;
  if ((text.match(/!/g) ?? []).length >= 3) heat += 0.08;

  heat = Math.min(1, heat * directives.strictnessMultiplier);

  const forbiddenHits = directives.forbidden.filter((f) => norm.includes(f));

  const drift =
    contextText && tokens.length >= 12
      ? driftDistance(text, contextText)
      : null;

  return {
    heat: Number(heat.toFixed(3)),
    drift: drift === null ? null : Number(drift.toFixed(3)),
    lexiconHits: hits,
    directed,
    capsRatio: Number(capsRatio.toFixed(2)),
    forbiddenHits,
    immediateFlag,
    contentTokens: tokens.length,
  };
}

export function decide(
  metrics: ContentMetrics,
  cal: Calibration,
  directives: ConstitutionDirectives,
  targetKind: "post" | "comment",
): AgentDecision | null {
  const motto = directives.motto
    ? ` This Room's constitution asks: "${directives.motto}"`
    : "";

  if (metrics.immediateFlag || metrics.heat >= cal.heat_flag) {
    return {
      action: "flag",
      trigger: "heat_flag",
      reason: `Escalated to human review — this reads as a serious personal attack (heat ${metrics.heat} ≥ ${cal.heat_flag.toFixed(2)}).`,
    };
  }

  if (targetKind === "comment" && metrics.heat >= cal.heat_collapse) {
    return {
      action: "collapse",
      trigger: "heat_collapse",
      reason: `Collapsed pending review — personal hostility detected (heat ${metrics.heat} ≥ ${cal.heat_collapse.toFixed(2)}: ${metrics.lexiconHits.slice(0, 4).join(", ")}).${motto}`,
    };
  }

  if (metrics.forbiddenHits.length > 0) {
    return {
      action: "nudge",
      trigger: "heat_nudge",
      reason: `Gentle reminder: the constitution of this Room asks members to avoid "${metrics.forbiddenHits[0]}". Consider rephrasing.`,
    };
  }

  if (metrics.heat >= cal.heat_nudge) {
    return {
      action: "nudge",
      trigger: "heat_nudge",
      reason: `This ${targetKind} is running hot (heat ${metrics.heat} ≥ ${cal.heat_nudge.toFixed(2)}). Consider a cooldown before replying — attack the idea, not the person.${motto}`,
    };
  }

  if (
    targetKind === "comment" &&
    metrics.drift !== null &&
    metrics.drift >= cal.drift_nudge
  ) {
    return {
      action: "nudge",
      trigger: "drift_nudge",
      reason: `This comment looks off-topic for the thread (drift ${metrics.drift} ≥ ${cal.drift_nudge.toFixed(2)}). Maybe it deserves its own post?`,
    };
  }

  return null;
}

export function detectDogpile(
  recent: Array<{
    author_persona_id: string;
    body: string;
    created_at: string;
  }>,
  targetAuthorId: string,
  cal: Calibration,
  directives: ConstitutionDirectives,
): AgentDecision | null {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const hostileAuthors = new Set<string>();

  for (const c of recent) {
    if (c.author_persona_id === targetAuthorId) continue;
    if (new Date(c.created_at).getTime() < cutoff) continue;
    const m = analyzeContent(c.body, directives, null);
    if (m.heat >= 0.35) hostileAuthors.add(c.author_persona_id);
  }

  if (hostileAuthors.size >= cal.dogpile_count) {
    return {
      action: "nudge",
      trigger: "dogpile_count",
      reason: `${hostileAuthors.size} people are piling onto one member in this thread. That's a dogpile — make your point once, then let it breathe.`,
    };
  }
  return null;
}
