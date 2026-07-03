/**
 * A Room's constitution is free text written by the community. Two kinds of
 * content shape the agent:
 *
 *  1. Directive lines (machine-readable, optional):
 *       agent.strictness: relaxed | normal | strict
 *       agent.forbid: word1, word2, some phrase
 *  2. Everything else — the community's values prose. It is folded into the
 *     topic baseline for drift detection and quoted in nudge messages.
 */

export type ConstitutionDirectives = {
  strictnessMultiplier: number; // scales the heat score
  forbidden: string[];          // terms/phrases that trigger a nudge on sight
  valuesText: string;           // prose (directives stripped)
  motto: string | null;         // first prose line, quoted in agent messages
};

export function parseConstitution(text: string): ConstitutionDirectives {
  let strictnessMultiplier = 1.0;
  const forbidden: string[] = [];
  const prose: string[] = [];

  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    const m = line.match(/^agent\.(strictness|forbid)\s*:\s*(.+)$/i);
    if (!m) {
      if (line) prose.push(line);
      continue;
    }
    if (m[1].toLowerCase() === "strictness") {
      const v = m[2].trim().toLowerCase();
      strictnessMultiplier = v === "strict" ? 1.25 : v === "relaxed" ? 0.8 : 1.0;
    } else {
      forbidden.push(
        ...m[2]
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );
    }
  }

  return {
    strictnessMultiplier,
    forbidden,
    valuesText: prose.join("\n"),
    motto: prose.find((l) => l.length > 8 && !l.startsWith("#")) ?? null,
  };
}
