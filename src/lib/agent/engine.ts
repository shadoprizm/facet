import {
  SEVERE_PHRASES,
  SEVERE_WORDS,
  MODERATE_WORDS,
  MILD_WORDS,
  FLAG_IMMEDIATE,
} from "./lexicon";
import { normalize, tokenize, driftDistance } from "./text";
import type { ConstitutionDirectives } from "./constitution";
import type { Calibration } from "@/lib/types";

export type ContentMetrics = {
  heat: number;               // 0..1 hostility estimate
  drift: number | null;       // 0..1 topic distance (comments only)
  lexiconHits: string[];
  directed: boolean;          // aimed at "you"
  capsRatio: number;
  forbiddenHits: string[];    // constitution agent.forbid matches
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

/** Analyze a single piece of content against the Room's constitution. */
export function analyzeContent(
  text: string,
  directives: ConstitutionDirectives,
  contextText: string | null
): ContentMetrics {
  const norm = normalize(text);
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);

  let sum = 0;
  const hits: string[] = [];

  for (const [phrase, w] of Object.entries(SEVERE_PHRASES)) {
    if (norm.includes(phrase)) {
      sum += w;
      hits.push(phrase);
    }
  }
  for (const dict of [SEVERE_WORDS, MODERATE_WORDS, MILD_WORDS]) {
    for (const [word, w] of Object.entries(dict)) {
      if (tokenSet.has(word)) {
        sum += w;
        hits.push(word);
      }
    }
  }

  const immediateFlag = tokens.some((t) => FLAG_IMMEDIATE.has(t));

  // Attacks aimed at a person burn hotter than attacks on an idea.
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

  // Drift needs enough signal to be meaningful: hashed BoW vectors are too
  // sparse below ~12 content words, so short comments are never drift-checked.
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

/**
 * Map metrics onto an action using the Room's *learned* calibration.
 * Severity wins: flag > collapse > nudge. Collapse only applies to comments.
 */
export function decide(
  metrics: ContentMetrics,
  cal: Calibration,
  directives: ConstitutionDirectives,
  targetKind: "post" | "comment"
): AgentDecision | null {
  const motto = directives.motto ? ` This Room's constitution asks: “${directives.motto}”` : "";

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
      reason: `Gentle reminder: the constitution of this Room asks members to avoid “${metrics.forbiddenHits[0]}”. Consider rephrasing.`,
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

/**
 * Dogpile detection: N distinct personas piling hostile replies onto one
 * author inside 30 minutes. Returns a thread-level nudge when tripped.
 */
export function detectDogpile(
  recent: Array<{
    author_persona_id: string;
    body: string;
    created_at: string;
  }>,
  targetAuthorId: string,
  cal: Calibration,
  directives: ConstitutionDirectives
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
