// Free-text beat fields, in the order the editor shows them; `area` = multi-line. Hints paraphrase the page they cite.
export const BEAT_TEXT_FIELDS = {
  title: { label: "TITLE", area: false, hint: "" },
  goal: {
    label: "GOAL",
    area: false,
    hint: "What the Agents are trying to do here. It gives the players something to aim at.",
  },
  readAloud: {
    label: "READ ALOUD (what you say at the table)",
    area: true,
    hint: "Set the scene, then end on an event or question that pulls the players in (Core Rulebook p.317).",
  },
  gmNotes: {
    label: "GM NOTES · WHAT'S REALLY GOING ON",
    area: true,
    hint: "What the players don't know yet (Core Rulebook p.318, step 3).",
  },
  outcome: { label: "OUTCOME (fill in after play)", area: true, hint: "" },
} as const;
export type BeatTextField = keyof typeof BEAT_TEXT_FIELDS;

// The parts of a scene STORY's pencils open on their own; EDIT shows them all.
export const BEAT_SECTIONS = [
  "goal",
  "readAloud",
  "gmNotes",
  "outcome",
  "exits",
  "tests",
  "pools",
  "place",
  "cast",
  "fight",
] as const;
export type BeatSection = (typeof BEAT_SECTIONS)[number];
