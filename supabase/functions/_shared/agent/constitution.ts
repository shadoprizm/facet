// SOURCE OF TRUTH: src/lib/agent/constitution.ts in the Next.js app.
// Vendored into the Edge Function. KEEP IN SYNC.

export type ConstitutionDirectives = {
  strictnessMultiplier: number;
  forbidden: string[];
  valuesText: string;
  motto: string | null;
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
          .filter(Boolean),
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
