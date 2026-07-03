/**
 * Minimal local NLP: tokenizer + hashed term-frequency vectors + cosine
 * similarity. This is the "embedding" backing topic-drift detection. It is
 * deterministic, dependency-free, and costs microseconds per comment — the
 * interface (textVector/cosine) is the seam where a real embedding model
 * (transformers.js MiniLM, Ollama, etc.) can be swapped in later.
 */

const STOPWORDS = new Set(
  `a an and are as at be but by for from has have i if in is it its me my not
   of on or our so than that the their them then there these they this to was
   we what when which who will with you your yours am do does did just can
   could should would about into over under out up down very really more most
   some any all no nor too s t don im ive youre dont its isnt arent wasnt
   like get got make made going go one two also even still way thing things`
    .split(/\s+/)
    .filter(Boolean)
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
    // Light stemming: fold trivial plurals into the singular bucket.
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
