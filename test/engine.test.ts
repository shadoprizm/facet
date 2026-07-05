import { describe, it, expect } from "vitest";
import {
  analyzeContent,
  decide,
  detectDogpile,
  type ContentMetrics,
} from "../src/lib/agent/engine";
import { parseConstitution } from "../src/lib/agent/constitution";
import { tokenize, normalize, normalizeAggressive } from "../src/lib/agent/text";
import type { Calibration } from "../src/lib/types";

// Default calibration, matching the schema defaults in 0001_init.sql.
const cal: Calibration = {
  room_id: "test",
  heat_nudge: 0.55,
  heat_collapse: 0.8,
  heat_flag: 0.92,
  drift_nudge: 0.97,
  dogpile_count: 3,
  learning_rate: 0.06,
  history: [],
  updated_at: "",
};

const constitution = parseConstitution(
  [
    "Be excellent to each other. Debate ideas, not people.",
    "agent.strictness: normal",
    "agent.forbid: politics",
  ].join("\n"),
);

const contextText =
  "What are the best hiking trails in Gatineau Park this fall? " +
  constitution.valuesText;

function metrics(text: string, ctx: string | null = contextText): ContentMetrics {
  return analyzeContent(text, constitution, ctx);
}

// ============================================================ analyzeContent

describe("analyzeContent — lexicon tiers", () => {
  it("returns zero heat for neutral text", () => {
    expect(metrics("The Wolf Trail loop is fantastic in October.").heat).toBe(0);
  });

  it("accumulates heat across multiple moderate words", () => {
    const m = metrics("This list is garbage, absolute trash advice honestly.");
    expect(m.heat).toBeGreaterThan(0.3);
    expect(m.heat).toBeLessThan(0.55); // below nudge threshold on its own
    expect(m.lexiconHits).toEqual(expect.arrayContaining(["garbage", "trash"]));
  });

  it("scores a single severe directed word meaningfully (locks current value)", () => {
    // "moron" (0.55) × 1.35 directed boost = raw 0.74 → heat 1-exp(-0.74) ≈ 0.524.
    // Below the nudge threshold on its own — locks in this calibration fact.
    const m = metrics("You are a moron.");
    expect(m.heat).toBeCloseTo(0.524, 2);
    expect(m.directed).toBe(true);
  });

  it("flags immediately on FLAG_IMMEDIATE tokens", () => {
    const m = metrics("go kys right now");
    expect(m.immediateFlag).toBe(true);
  });

  it("does not flag immediately on innocent text", () => {
    expect(metrics("have a great hike").immediateFlag).toBe(false);
  });
});

describe("analyzeContent — circumvention resistance (T3#10)", () => {
  it("aggressive normalize folds leetspeak", () => {
    expect(normalizeAggressive("m0ron")).toBe("moron");
    expect(normalizeAggressive("1d10t")).toBe("idiot");
  });

  it("aggressive normalize strips internal punctuation breaking words", () => {
    expect(normalizeAggressive("id.iot")).toBe("idiot");
    expect(normalizeAggressive("id-iot")).toBe("idiot");
  });

  it("aggressive normalize collapses 2+ consecutive repeated chars to one", () => {
    expect(normalizeAggressive("idddiot")).toBe("idiot");
    expect(normalizeAggressive("book")).toBe("bok");
    expect(normalizeAggressive("iddddddiot")).toBe("idiot");
  });

  it("catches a leetspeak circumvented insult", () => {
    // "m0ron" should be caught via the aggressive-normalized scan.
    const m = metrics("You are a m0ron");
    expect(m.lexiconHits).toContain("moron");
    expect(m.heat).toBeGreaterThan(0.5);
  });

  it("catches a punctuation-broken circumvented insult", () => {
    const m = metrics("you are an id.iot");
    expect(m.lexiconHits).toContain("idiot");
  });

  it("catches a char-stretched circumvented insult", () => {
    const m = metrics("you idddiot");
    expect(m.lexiconHits).toContain("idiot");
  });
});

describe("analyzeContent — boosts", () => {
  it("applies the 1.35 directed boost for 'you' attacks", () => {
    const undirected = metrics("This opinion is pathetic trash."); // no "you"
    const directed = metrics("You are pathetic trash.");
    expect(directed.heat).toBeGreaterThan(undirected.heat);
    expect(directed.directed).toBe(true);
    expect(undirected.directed).toBe(false);
  });

  it("boosts heat for high ALL-CAPS ratio", () => {
    const normal = metrics("you are a clown");
    const caps = metrics("YOU ARE A CLOWN");
    expect(caps.capsRatio).toBeGreaterThan(0.4);
    expect(caps.heat).toBeGreaterThan(normal.heat);
  });

  it("boosts heat for exclamation storms (≥3)", () => {
    const plain = metrics("you are a clown");
    const storm = metrics("you are a clown!!!");
    expect(storm.heat).toBeGreaterThan(plain.heat);
  });

  it("ignores caps on very short strings", () => {
    const m = metrics("OK");
    expect(m.capsRatio).toBe(0);
  });
});

describe("analyzeContent — drift", () => {
  it("returns null drift for short comments (<12 tokens)", () => {
    expect(metrics("Thanks, great tips!").drift).toBeNull();
  });

  it("returns a drift score for long-enough comments", () => {
    const offTopic =
      "Crypto prices are mooning right now, buy bitcoin and ethereum before " +
      "the halving pumps your portfolio gains and the markets rally.";
    const d = metrics(offTopic).drift;
    expect(d).not.toBeNull();
    expect(d).toBeGreaterThan(0.5);
  });
});

describe("analyzeContent — constitution directives", () => {
  it("forbid terms produce forbiddenHits", () => {
    const m = metrics("This is why politics ruins everything.");
    expect(m.forbiddenHits).toContain("politics");
  });

  it("strictness: strict scales heat up (1.25x)", () => {
    const strict = parseConstitution("agent.strictness: strict");
    const relaxed = parseConstitution("agent.strictness: relaxed");
    const text = "you pathetic clown";
    expect(analyzeContent(text, strict, null).heat).toBeGreaterThan(
      analyzeContent(text, relaxed, null).heat,
    );
  });
});

// ============================================================ decide

describe("decide — severity ordering", () => {
  it("escalates to flag on immediateFlag", () => {
    const m: ContentMetrics = {
      heat: 0.2, drift: null, lexiconHits: ["kys"], directed: false,
      capsRatio: 0, forbiddenHits: [], immediateFlag: true, contentTokens: 5,
    };
    const d = decide(m, cal, constitution, "comment");
    expect(d?.action).toBe("flag");
    expect(d?.trigger).toBe("heat_flag");
  });

  it("escalates to flag when heat ≥ heat_flag", () => {
    const m: ContentMetrics = {
      heat: 0.95, drift: null, lexiconHits: ["pathetic"], directed: true,
      capsRatio: 0.5, forbiddenHits: [], immediateFlag: false, contentTokens: 10,
    };
    expect(decide(m, cal, constitution, "comment")?.action).toBe("flag");
  });

  it("collapses comments when heat_collapse ≤ heat < heat_flag", () => {
    const m: ContentMetrics = {
      heat: 0.85, drift: null, lexiconHits: ["idiot"], directed: true,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 10,
    };
    const d = decide(m, cal, constitution, "comment");
    expect(d?.action).toBe("collapse");
  });

  it("does NOT collapse posts (collapse is comment-only)", () => {
    const m: ContentMetrics = {
      heat: 0.85, drift: null, lexiconHits: ["idiot"], directed: true,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 10,
    };
    const d = decide(m, cal, constitution, "post");
    // Falls through to nudge at most — never collapse for posts.
    expect(d?.action).not.toBe("collapse");
  });

  it("nudges when heat_nudge ≤ heat < heat_collapse", () => {
    const m: ContentMetrics = {
      heat: 0.6, drift: null, lexiconHits: ["stupid"], directed: false,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 10,
    };
    const d = decide(m, cal, constitution, "comment");
    expect(d?.action).toBe("nudge");
    expect(d?.trigger).toBe("heat_nudge");
  });

  it("forbid-hit produces a nudge even with zero heat", () => {
    const m: ContentMetrics = {
      heat: 0, drift: null, lexiconHits: [], directed: false,
      capsRatio: 0, forbiddenHits: ["politics"], immediateFlag: false, contentTokens: 5,
    };
    const d = decide(m, cal, constitution, "comment");
    expect(d?.action).toBe("nudge");
  });

  it("drift nudge fires when comment is off-topic and on-topic otherwise", () => {
    const onTopic: ContentMetrics = {
      heat: 0, drift: 0.5, lexiconHits: [], directed: false,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 20,
    };
    const offTopic: ContentMetrics = {
      heat: 0, drift: 0.99, lexiconHits: [], directed: false,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 20,
    };
    expect(decide(onTopic, cal, constitution, "comment")).toBeNull();
    expect(decide(offTopic, cal, constitution, "comment")?.trigger).toBe("drift_nudge");
  });

  it("returns null for calm content", () => {
    const m: ContentMetrics = {
      heat: 0, drift: 0.3, lexiconHits: [], directed: false,
      capsRatio: 0, forbiddenHits: [], immediateFlag: false, contentTokens: 20,
    };
    expect(decide(m, cal, constitution, "comment")).toBeNull();
  });
});

// ============================================================ detectDogpile

describe("detectDogpile", () => {
  const now = new Date().toISOString();
  const hostile = (author: string, body = "you are an idiot") => ({
    author_persona_id: author,
    body,
    created_at: now,
  });

  it("trips when ≥ dogpile_count distinct hostile authors reply", () => {
    const recent = [
      hostile("a"), hostile("b"), hostile("c"),
    ];
    const d = detectDogpile(recent, "target", cal, constitution);
    expect(d?.trigger).toBe("dogpile_count");
  });

  it("ignores hostile replies older than 30 minutes", () => {
    const old = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const recent = [
      { author_persona_id: "a", body: "you idiot", created_at: old },
      { author_persona_id: "b", body: "you idiot", created_at: old },
      { author_persona_id: "c", body: "you idiot", created_at: old },
    ];
    expect(detectDogpile(recent, "target", cal, constitution)).toBeNull();
  });

  it("ignores replies from the target author themselves", () => {
    const recent = [
      hostile("a"), hostile("b"),
      { author_persona_id: "target", body: "you are all idiots", created_at: now },
    ];
    // Only 2 distinct hostile non-target authors — below threshold of 3.
    expect(detectDogpile(recent, "target", cal, constitution)).toBeNull();
  });

  it("ignores non-hostile replies", () => {
    const recent = [
      { author_persona_id: "a", body: "I agree, great point", created_at: now },
      { author_persona_id: "b", body: "thanks for this", created_at: now },
      { author_persona_id: "c", body: "very helpful", created_at: now },
    ];
    expect(detectDogpile(recent, "target", cal, constitution)).toBeNull();
  });
});

// ============================================================ text helpers

describe("text helpers", () => {
  it("normalize strips URLs, apostrophes, and punctuation", () => {
    expect(normalize("Don't go to https://example.com/x!")).toBe(
      "dont go to",
    );
  });

  it("tokenize removes stopwords and short tokens", () => {
    const toks = tokenize("I am going to the park now");
    expect(toks).not.toContain("i");
    expect(toks).not.toContain("am");
    expect(toks).not.toContain("the");
    expect(toks).not.toContain("going"); // in the stopword list
    expect(toks).toContain("park");
  });
});

// ============================================================ constitution

describe("parseConstitution", () => {
  it("parses strictness directive", () => {
    expect(parseConstitution("agent.strictness: strict").strictnessMultiplier).toBe(1.25);
    expect(parseConstitution("agent.strictness: relaxed").strictnessMultiplier).toBe(0.8);
    expect(parseConstitution("agent.strictness: normal").strictnessMultiplier).toBe(1.0);
  });

  it("defaults to 1.0 multiplier with no directive", () => {
    expect(parseConstitution("Just some prose here.").strictnessMultiplier).toBe(1.0);
  });

  it("parses comma-separated forbid terms", () => {
    const d = parseConstitution("agent.forbid: crypto, politics, spam");
    expect(d.forbidden).toEqual(["crypto", "politics", "spam"]);
  });

  it("extracts a motto from prose (first non-heading line >8 chars)", () => {
    const d = parseConstitution("Be excellent to each other.\nagent.strictness: strict");
    expect(d.motto).toBe("Be excellent to each other.");
  });

  it("strips directive lines from valuesText", () => {
    const d = parseConstitution("Prose line.\nagent.strictness: strict");
    expect(d.valuesText).toBe("Prose line.");
  });
});
