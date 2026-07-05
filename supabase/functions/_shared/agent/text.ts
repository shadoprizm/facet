// SOURCE OF TRUTH: src/lib/agent/text.ts in the Next.js app.
// Vendored into the Edge Function so Deno can resolve it (no @/ aliases).
// KEEP IN SYNC when editing the engine. The app-side copy is authoritative.

export const STOPWORDS = new Set(
  `a an and are as at be but by for from has have i if in is it its me my not
   of on or our so than that the their them then there these they this to was
   we what when which who will with you your yours am do does did just can
   could should would about into over under out up down very really more most
   some any all no nor too s t don im ive youre dont its isnt arent wasnt
   like get got make made going go one two also even still way thing things`
    .split(/\s+/)
    .filter(Boolean),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aggressive normalization for lexicon matching ONLY (never used for drift
 * vectors — it would destroy signal). Folds common circumvention tricks:
 * leetspeak, repeated characters, and stray internal punctuation.
 * SOURCE OF TRUTH: src/lib/agent/text.ts — keep in sync.
 */
export function normalizeAggressive(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/[^\x00-\x7f]/g, " ");
  s = s
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/!/g, "i");
  s = s.replace(/[.\-_,/\\*|~`'"<>]+/g, "");
  s = s.replace(/([a-z])\1+/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

const DIM = 512;

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

/** L2-normalized hashed bag-of-words vector. */
export function textVector(text: string): Float32Array {
  const vec = new Float32Array(DIM);
  for (const tok of tokenize(text)) {
    const stem = tok.length > 3 && tok.endsWith("s") ? tok.slice(0, -1) : tok;
    vec[fnv1a(stem)] += 1;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i];
  return dot;
}

/** 0 = same topic, 1 = unrelated. */
export function driftDistance(text: string, contextText: string): number {
  return 1 - cosine(textVector(text), textVector(contextText));
}
