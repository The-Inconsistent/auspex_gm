import type { BeatTest, Skill } from "@wg/shared";

// A new Test: Awareness at the Standard DN (Core p.161), for the GM to change.
export const NEW_TEST: BeatTest = {
  kind: "skill",
  skill: "Awareness",
  attribute: null,
  dn: 3,
  who: "one",
  purpose: "",
  shifts: [],
  onSuccess: "",
  onFailure: "",
};

// Shifting For Glory works once per Test (Core p.166), so its chip goes once a rung holds it.
export const GLORY_SHIFT = "+1 Glory";
// The uses of a Shift the book names (Core pp.165–166), as chips that start a rung of the ladder. Extra damage is
// left out: it's for attacks, which the tracker runs.
export const SHIFT_USES = ["Gain Information", "Improve Quality", "Improve Speed", GLORY_SHIFT] as const;
// A successful social Skill Test (the Skills on Core p.167) can Shift to improve an NPC's Attitude one step (optional
// rule, Core p.168).
export const ATTITUDE_SHIFT = "Improve the NPC’s Attitude one step";

// Fail Forward's mechanical consequences (Core p.319): succeed at a cost, usually +2 DN on that Skill for the scene, or
// a choice between failing and one of the rest.
export const skillPenalty = (skill: Skill) => `+2 DN on ${skill} Tests for the rest of the scene`;
export const FAIL_FORWARD = [
  "The GM gains 1 Ruin",
  "Lose Wealth or Ammo",
  "Lose Influence",
  "Suffer Shock",
  "Suffer Wounds",
  "Some Wargear is broken",
] as const;
