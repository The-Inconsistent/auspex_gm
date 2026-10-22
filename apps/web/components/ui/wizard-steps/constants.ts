// NEW CAMPAIGN's seven steps: the first four before the campaign exists (/c/new), the last three inside it
// (/c/<id>/start).
export const WIZARD_STEPS = ["tier", "premise", "table", "name", "setting", "factions", "players"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  tier: "TIER",
  premise: "PREMISE",
  table: "TABLE",
  name: "NAME",
  setting: "SETTING",
  factions: "FACTIONS",
  players: "PLAYERS",
};
