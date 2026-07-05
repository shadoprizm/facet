// SOURCE OF TRUTH: src/lib/agent/lexicon.ts in the Next.js app.
// Vendored into the Edge Function. KEEP IN SYNC.

export const SEVERE_PHRASES: Record<string, number> = {
  "shut up": 0.5,
  "shut it": 0.5,
  "kill yourself": 1.4,
  "nobody wants you here": 0.6,
  "get out of here": 0.35,
  "touch grass": 0.3,
  "ratio you": 0.3,
};

export const SEVERE_WORDS: Record<string, number> = {
  stfu: 0.55,
  gtfo: 0.45,
  idiot: 0.5,
  idiots: 0.5,
  moron: 0.55,
  imbecile: 0.55,
  dumbass: 0.55,
  jackass: 0.5,
  scumbag: 0.6,
  loser: 0.45,
  losers: 0.45,
  pathetic: 0.5,
  clown: 0.5,
  clowns: 0.5,
  bitch: 0.6,
  bastard: 0.5,
};

export const MODERATE_WORDS: Record<string, number> = {
  stupid: 0.3,
  dumb: 0.28,
  trash: 0.28,
  garbage: 0.28,
  hate: 0.25,
  awful: 0.2,
  terrible: 0.18,
  liar: 0.32,
  lying: 0.28,
  fraud: 0.3,
  shill: 0.32,
  troll: 0.3,
  trolls: 0.3,
  bot: 0.22,
  brainwashed: 0.32,
  delusional: 0.35,
  ignorant: 0.3,
  ridiculous: 0.18,
  worthless: 0.4,
  disgusting: 0.3,
  embarrassing: 0.22,
  fuck: 0.35,
  fucking: 0.3,
  shit: 0.25,
  bullshit: 0.3,
  crap: 0.15,
};

export const MILD_WORDS: Record<string, number> = {
  wrong: 0.1,
  nonsense: 0.14,
  lazy: 0.12,
  useless: 0.18,
  boring: 0.08,
  cringe: 0.12,
  joke: 0.12,
};

/** Words that, on their own, always escalate straight to a human flag. */
export const FLAG_IMMEDIATE = new Set(["kys"]);
