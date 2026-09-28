import type { Attribute, Bonus, BuildStep } from "@wg/shared";

// The builder route's id for a character not made yet: /c/<campaignId>/build/new (GM only).
export const NEW_CHARACTER = "new";

// The screens, in the Core rulebook's creation order (p.17), and what each tab says. "review" is the builder's own.
export const BUILDER_STEPS = [
  "tier",
  "archetype",
  "customise",
  "faction",
  "ascension",
  "detail",
  "advance",
  "review",
] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];
export const STEP_LABELS: Record<BuilderStep, string> = {
  tier: "TIER",
  archetype: "ARCHETYPE",
  customise: "CUSTOMISE",
  faction: "FACTION",
  ascension: "ASCENSION",
  detail: "DETAIL",
  advance: "ADVANCE",
  review: "REVIEW",
};
export const STEP_CITES: Record<BuildStep, string> = {
  tier: "Core pp.18–20",
  archetype: "Core pp.21–22",
  customise: "Core pp.22–26",
  faction: "Core pp.26–30",
  ascension: "Core p.148",
  detail: "Core pp.30–38",
  advance: "Core pp.146–151",
};

// Where a draft waits between visits on this device, per table and character.
export const draftKey = ({ campaignId, characterId }: { campaignId: string; characterId: string | null }) =>
  `wg-build:${campaignId}:${characterId ?? NEW_CHARACTER}`;

// The same, for a character in the signed-in user's own library (issue #14).
export const libraryDraftKey = (id: string) => `wg-build:library:${id}`;

// How long the library builder waits after the last change before saving the draft, so a burst of taps is one PUT.
export const AUTOSAVE_MS = 1500;

// Full names for the Attribute keys, for labels and screen readers.
export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  S: "Strength",
  T: "Toughness",
  A: "Agility",
  I: "Initiative",
  Wil: "Willpower",
  Int: "Intellect",
  Fel: "Fellowship",
};

// What a Background row's +1 goes to, as the sheet names it (the `Bonus` values in @wg/shared).
export const BONUS_LABELS: Record<Bonus, string> = {
  maxWounds: "Max Wounds",
  maxShock: "Max Shock",
  defence: "Defence",
  resilience: "Resilience",
  resolve: "Resolve",
  conviction: "Conviction",
  influence: "Influence",
  speed: "Speed",
  determination: "Determination",
  wealth: "Wealth",
  passiveAwareness: "Passive Awareness",
  corruption: "Corruption",
};

// The Tiers a character can be built at (Core p.19), for the library's Tier picker.
export const TIERS = [1, 2, 3, 4, 5] as const;
