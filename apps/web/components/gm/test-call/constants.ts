import { SKILLS, retypeTest, type BeatTest, type Skill } from "@wg/shared";

export const SKILL_NAMES = Object.keys(SKILLS) as Skill[];

// What CALL A TEST starts on: the commonest call at the table, "Awareness, DN 3, everyone" (Core p.161).
export const NEW_CALL: BeatTest = retypeTest(
  {
    kind: "skill",
    skill: "Awareness",
    attribute: null,
    dn: 3,
    who: "each",
    purpose: "",
    shifts: [],
    onSuccess: "",
    onFailure: "",
  },
  "skill",
);
