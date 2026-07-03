/* Sanity harness for the moderation engine. Run: npx tsx scripts/agent-sanity.ts */
import { analyzeContent, decide } from "../src/lib/agent/engine";
import { parseConstitution } from "../src/lib/agent/constitution";
import type { Calibration } from "../src/lib/types";

const cal: Calibration = {
  room_id: "x",
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
  `Be excellent to each other. Debate ideas, not people.
agent.strictness: normal
agent.forbid: politics`
);

const post = "What are the best hiking trails in Gatineau Park this fall? Looking for moderate loops with good views of the leaves.";

const cases: Array<[string, string]> = [
  ["calm on-topic", "The Wolf Trail loop is fantastic in October, moderate effort and the lookout is worth it."],
  ["mild disagreement", "I think that's wrong, the King Mountain trail is overrated and boring."],
  ["hot but not personal", "This list is garbage, absolute trash advice honestly."],
  ["directed insult (nudge/collapse)", "You're an idiot, that trail is garbage and so is your take."],
  ["severe attack (collapse/flag)", "You're a pathetic idiot. SHUT UP. Nobody wants you here, you absolute clown!!!"],
  ["forbidden topic", "This is why politics ruins everything, the government should fix the trails."],
  ["topic drift", "Crypto prices are mooning right now, buy bitcoin and ethereum before the halving pumps your portfolio gains."],
  ["short benign", "Thanks, great tips!"],
];

for (const [label, text] of cases) {
  const m = analyzeContent(text, constitution, `${post}\n${constitution.valuesText}`);
  const d = decide(m, cal, constitution, "comment");
  console.log(
    `${label.padEnd(34)} heat=${String(m.heat).padEnd(6)} drift=${String(m.drift).padEnd(6)} -> ${d ? `${d.action} (${d.trigger})` : "no action"}`
  );
}
