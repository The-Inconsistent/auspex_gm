// The two views of the player's SHEET tab, in order; AT A GLANCE opens first.
export const SHEET_VIEWS = {
  glance: { label: "AT A GLANCE" },
  dossier: { label: "DOSSIER" },
} as const;
export type SheetView = keyof typeof SHEET_VIEWS;

// How many Skills AT A GLANCE lists, highest total first.
export const GLANCE_SKILLS = 5;

// The Traits row (Core pp.36–37), under the short labels the printed sheet uses. `key` is a field of deriveStats and
// also the cell's term in lib/sheet-terms, which holds its meaning and rule.
export const TRAIT_CELLS = [
  { label: "DEF", key: "defence" },
  { label: "RES", key: "resilience" },
  { label: "RESOLVE", key: "resolve" },
  { label: "CONV", key: "conviction" },
  { label: "SPEED", key: "speed" },
  { label: "AWARE", key: "passiveAwareness" },
] as const;

// The DOSSIER's jump strip, in the book's order; each `id` is the anchor of a box.
export const DOSSIER_JUMPS = [
  { label: "ATTRIBUTES", id: "ps-attr" },
  { label: "SKILLS", id: "ps-skills" },
  { label: "WRATH", id: "ps-wrath" },
  { label: "SURVIVAL", id: "ps-survival" },
  { label: "WARGEAR", id: "ps-wargear" },
  { label: "TALENTS", id: "ps-talents" },
  { label: "INJURIES", id: "ps-injuries" },
  { label: "NOTES", id: "ps-notes" },
  { label: "XP", id: "ps-xp" },
] as const;

// The Skill a weapon's pool is rolled on, as the card's tag (rules-flow.md §4: Ballistic Skill + Agility ranged, Weapon
// Skill + Initiative melee).
export const WEAPON_SKILL_TAGS = { "Ballistic Skill": "BS", "Weapon Skill": "WS" } as const;
