// The two views of the player's SHEET tab, in order; AT A GLANCE opens first.
export const SHEET_VIEWS = {
  glance: { label: "AT A GLANCE" },
  dossier: { label: "DOSSIER" },
} as const;
export type SheetView = keyof typeof SHEET_VIEWS;

// How many Skills AT A GLANCE lists, highest total first.
export const GLANCE_SKILLS = 5;

// The Traits row (Core pp.36–37), under the short labels the printed sheet uses; each opens its rule by id
// (packages/data/rules). `key` is a field of deriveStats.
export const TRAIT_CELLS = [
  { label: "DEF", key: "defence", rule: "stat-defence" },
  { label: "RES", key: "resilience", rule: "stat-resilience" },
  { label: "RESOLVE", key: "resolve", rule: "trait-resolve" },
  { label: "CONV", key: "conviction", rule: "stat-conviction" },
  { label: "SPEED", key: "speed", rule: "stat-speed" },
  { label: "AWARE", key: "passiveAwareness", rule: "trait-passive-awareness" },
] as const;

// The DOSSIER's jump strip; each `id` is the anchor of a section.
export const DOSSIER_JUMPS = [
  { label: "ATTRIBUTES", id: "ps-attr" },
  { label: "SKILLS", id: "ps-skills" },
  { label: "TALENTS", id: "ps-talents" },
  { label: "GEAR", id: "ps-gear" },
  { label: "ORDERS", id: "ps-orders" },
  { label: "WHO", id: "ps-who" },
] as const;

// The Skill a weapon's pool is rolled on, as the card's tag (rules-flow.md §4: Ballistic Skill + Agility ranged, Weapon
// Skill + Initiative melee).
export const WEAPON_SKILL_TAGS = { "Ballistic Skill": "BS", "Weapon Skill": "WS" } as const;
