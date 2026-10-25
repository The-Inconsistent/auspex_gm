import { ATTRIBUTE_NAMES, type Attribute, type Skill } from "@wg/shared";

// One term a new player meets on a sheet. `meaning` is our own plain wording, never the book's sentences nor its lists
// in their order, so the JOIN page can show it before anyone holds a seat; `cite` is the page it comes from; `rule` is
// the rules-reference entry a seated player can open in full (packages/data/rules).
export type SheetTerm = { name: string; cite: string; meaning: string; rule?: string };

export const SHEET_TERMS = {
  strength: {
    name: ATTRIBUTE_NAMES.S,
    cite: "Core p.119",
    rule: "stat-strength",
    meaning: "Muscle. It drives climbing, jumping and carrying, and how hard your blows land up close.",
  },
  toughness: {
    name: ATTRIBUTE_NAMES.T,
    cite: "Core p.119",
    rule: "stat-toughness",
    meaning:
      "How much punishment your body takes, from blades to poison and sickness. Wounds and Resilience are built on it.",
  },
  agility: {
    name: ATTRIBUTE_NAMES.A,
    cite: "Core p.119",
    rule: "stat-agility",
    meaning: "Steady hands and sure footing. It guides your shooting, driving and flying.",
  },
  initiative: {
    name: ATTRIBUTE_NAMES.I,
    cite: "Core p.119",
    rule: "stat-initiative",
    meaning: "How fast you react when a fight breaks out, most of all up close. Defence is built on it.",
  },
  willpower: {
    name: ATTRIBUTE_NAMES.Wil,
    cite: "Core p.120",
    rule: "stat-willpower",
    meaning: "Mental grit: staying calm under fire and steady against temptation and the Warp. Shock is built on it.",
  },
  intellect: {
    name: ATTRIBUTE_NAMES.Int,
    cite: "Core p.120",
    rule: "stat-intellect",
    meaning: "How sharp and learned you are: spotting clues, working machines, recalling lore.",
  },
  fellowship: {
    name: ATTRIBUTE_NAMES.Fel,
    cite: "Core p.120",
    rule: "stat-fellowship",
    meaning: "Charm and social sense: talking people round, bluffing, and catching a liar.",
  },
  attributes: {
    name: "Attributes",
    cite: "Core p.119",
    meaning: "The seven numbers for what your body and mind can do. A Test adds one of them to a Skill.",
  },
  skills: {
    name: "Skills",
    cite: "Core p.121",
    rule: "character-skills",
    meaning:
      "What you have trained at. Its rating plus the Attribute beside it is your dice; untrained, you still roll the Attribute.",
  },
  dice: {
    name: "Dice to roll",
    cite: "Core p.159",
    meaning: "How many six-sided dice to roll. Every 4 or 5 counts as an Icon; every 6 counts as two.",
  },
  dn: {
    name: "Difficulty Number (DN)",
    cite: "Core p.160",
    rule: "test-dn",
    meaning: "How many Icons a Test needs to pass. DN 3 is a standard task.",
  },
  defence: {
    name: "Defence",
    cite: "Core p.36",
    rule: "stat-defence",
    meaning: "How hard you are to hit: your Initiative −1. An attack on you needs this many Icons to land.",
  },
  resilience: {
    name: "Resilience",
    cite: "Core p.36",
    rule: "stat-resilience",
    meaning: "Your protection against damage: Toughness +1, plus your armour's AR. Only damage beyond it hurts you.",
  },
  armourRating: {
    name: "Armour Rating (AR)",
    cite: "Core p.36",
    meaning:
      "Your armour's protection, added to Resilience while you wear it. Invulnerable armour (marked *) ignores AP.",
  },
  wounds: {
    name: "Wounds",
    cite: "Core p.37",
    rule: "stat-wounds",
    meaning: "Real injuries. Damage above your Resilience becomes Wounds; past your maximum you are Dying.",
  },
  shock: {
    name: "Shock",
    cite: "Core p.37",
    rule: "stat-shock",
    meaning: "Mental strain and fatigue. Past your maximum you are Exhausted; rest recovers it.",
  },
  resolve: {
    name: "Resolve",
    cite: "Core p.37",
    rule: "trait-resolve",
    meaning: "Your nerve. You roll it to stand firm against Fear and similar strain; it starts at Willpower −1.",
  },
  conviction: {
    name: "Conviction",
    cite: "Core p.37",
    rule: "stat-conviction",
    meaning: "Your dice to resist corruption and Chaos, in a Corruption Test. It starts equal to your Willpower.",
  },
  determination: {
    name: "Determination",
    cite: "Core p.196",
    meaning:
      "When an attack Wounds you, roll this many dice: each Icon turns one Wound into Shock. It equals your Toughness.",
  },
  traumatic: {
    name: "Traumatic Injuries",
    cite: "Core p.193",
    meaning: "Lasting harm you take while Dying. Take more than your maximum (Tier +1) and you die.",
  },
  mutations: {
    name: "Mutations",
    cite: "Core p.287",
    meaning: "How Chaos has changed your body. A failed Mutation Test as your Corruption rises gives you one.",
  },
  corruption: {
    name: "Corruption",
    cite: "Core p.285",
    meaning: "The taint of Chaos on your soul. Each 5 points is a level that makes the next Corruption Test harder.",
  },
  bonus: {
    name: "Bonus",
    cite: "Core p.40",
    meaning: "What gear and changes add to an Attribute. Rating + Bonus is the TOTAL your Skills and Tests roll.",
  },
  speed: {
    name: "Speed",
    cite: "Core p.180",
    rule: "stat-speed",
    meaning: "How many metres you can move in one Turn.",
  },
  passiveAwareness: {
    name: "Passive Awareness",
    cite: "Core p.37",
    rule: "trait-passive-awareness",
    meaning: "How much you spot without looking for it: half your Awareness total, rounded up.",
  },
  influence: {
    name: "Influence",
    cite: "Core p.37",
    rule: "trait-influence",
    meaning:
      "How much your name and standing count for, rolled to obtain gear where society works. Fellowship −1, changed by your Archetype.",
  },
  wealth: {
    name: "Wealth",
    cite: "Core p.38",
    rule: "trait-wealth",
    meaning: "Money and valuables, spent on gear or bribes. You start with as much as your Tier.",
  },
  wrath: {
    name: "Wrath",
    cite: "Core p.164",
    rule: "character-wrath",
    meaning:
      "Your own pool, back to 2 each session. A point rerolls a Test's 1s, 2s and 3s, adds a fact to the scene, or recovers Shock.",
  },
  glory: {
    name: "Glory",
    cite: "Core p.164",
    rule: "character-glory",
    meaning:
      "A pool the whole team shares. It buys bonus dice or damage, nastier Critical Hits, or acting out of turn (Seize the Initiative).",
  },
  tier: {
    name: "Tier",
    cite: "Core p.19",
    meaning: "How powerful the whole group is, from Tier 1 up. Higher Tiers face deadlier threats.",
  },
  species: {
    name: "Species",
    cite: "Core p.21",
    meaning: "Whether you are Human, Astartes or alien. It sets your limits and some of your abilities.",
  },
  archetype: {
    name: "Archetype",
    cite: "Core p.21",
    meaning: "Your role. It brings Attribute and Skill bonuses, an Archetype Ability and your starting Wargear.",
  },
  rank: {
    name: "Rank",
    cite: "Core p.146",
    meaning: "Rises by 1 for every 40 XP you earn, up to 3. Some abilities grow with it.",
  },
  xp: {
    name: "Experience Points (XP)",
    cite: "Core p.20",
    meaning: "Earned in play and spent between sessions to improve your character.",
  },
  keywords: {
    name: "Keywords",
    cite: "Core p.21",
    meaning:
      "Labels for the groups and powers you are tied to, such as IMPERIUM. Some Talents, gear and powers require one.",
  },
  abilities: {
    name: "Abilities",
    cite: "Core p.21",
    meaning: "Special rules your Species, Archetype and background give you. Each names the page that explains it.",
  },
  talents: {
    name: "Talents",
    cite: "Core p.128",
    meaning: "Special knacks bought with XP, each its own rule with the page that explains it.",
  },
  wargear: {
    name: "Wargear",
    cite: "Core p.21",
    meaning: "Everything you carry into battle: weapons, armour and kit.",
  },
  damage: {
    name: "Damage (DMG)",
    cite: "Core p.207",
    rule: "stat-damage",
    meaning: "The weapon's damage on a hit, before the target's Resilience is taken off.",
  },
  ed: {
    name: "Extra Damage dice (ED)",
    cite: "Core p.207",
    rule: "stat-damage",
    meaning: "Extra dice you roll when you hit, each adding damage on a good roll (Core p.183).",
  },
  ap: {
    name: "Armour Penetration (AP)",
    cite: "Core p.207",
    rule: "stat-ap",
    meaning: "When it hits, take this off the target's Resilience. Invulnerable armour ignores it.",
  },
  range: {
    name: "Range",
    cite: "Core p.207",
    rule: "stat-range",
    meaning:
      "How far it reaches, in metres: Short / Medium / Long for guns, usually 1 for melee, a multiple of Strength if thrown.",
  },
  salvo: {
    name: "Salvo",
    cite: "Core p.208",
    rule: "stat-salvo",
    meaning: "How fast it fires, for options like Full Auto. Reloading afterwards takes a Simple Action and 1 Ammo.",
  },
  athletics: {
    name: "Athletics (S)",
    cite: "Core p.121",
    meaning: "Running, climbing, jumping, swimming: any feat of physical effort.",
  },
  awareness: {
    name: "Awareness (Int)",
    cite: "Core p.122",
    meaning: "Noticing what is around you: a sound, a hidden foe, something out of place.",
  },
  cunning: {
    name: "Cunning (Fel)",
    cite: "Core p.122",
    meaning: "Knowing the underworld's ways: shady dealings, rough contacts and dirty tricks.",
  },
  deception: {
    name: "Deception (Fel)",
    cite: "Core p.122",
    meaning: "Lying well, from a flat untruth to a careful half-truth.",
  },
  insight: {
    name: "Insight (Fel)",
    cite: "Core p.123",
    meaning: "Reading people: their mood, what they want, and when they are hiding something.",
  },
  intimidation: {
    name: "Intimidation (Wil)",
    cite: "Core p.123",
    meaning: "Getting your way through fear.",
  },
  investigation: {
    name: "Investigation (Int)",
    cite: "Core p.123",
    meaning: "Piecing clues together, digging through records and asking the right offices.",
  },
  leadership: {
    name: "Leadership (Wil)",
    cite: "Core p.124",
    meaning: "Getting others to follow you into danger, and steadying the shaken.",
  },
  medicae: {
    name: "Medicae (Int)",
    cite: "Core p.124",
    meaning: "Treating wounds and fighting off sickness and poison.",
  },
  persuasion: {
    name: "Persuasion (Fel)",
    cite: "Core p.125",
    meaning: "Winning someone over and changing their mind.",
  },
  pilot: {
    name: "Pilot (A)",
    cite: "Core p.125",
    meaning: "Driving and flying vehicles.",
  },
  psychicMastery: {
    name: "Psychic Mastery (Wil)",
    cite: "Core p.126",
    meaning: "Calling up psychic powers by bending the Warp. Only a psyker uses it.",
  },
  scholar: {
    name: "Scholar (Int)",
    cite: "Core p.126",
    meaning: "Recalling what you have studied: history, lore, the ways of the Imperium.",
  },
  stealth: {
    name: "Stealth (A)",
    cite: "Core p.126",
    meaning: "Hiding, moving unseen and slipping past security.",
  },
  survival: {
    name: "Survival (Wil)",
    cite: "Core p.127",
    meaning: "Living off the land: finding food and shelter, tracking, and finding your way.",
  },
  tech: {
    name: "Tech (Int)",
    cite: "Core p.127",
    meaning: "Working with machines: making them run, mending them, or taking them apart.",
  },
  ballisticSkill: {
    name: "Ballistic Skill (BS)",
    cite: "Core p.122",
    meaning: "The Skill for shooting and throwing, rolled with your Agility.",
  },
  weaponSkill: {
    name: "Weapon Skill (WS)",
    cite: "Core p.127",
    meaning: "The Skill for close combat, rolled with your Initiative.",
  },
} as const satisfies Record<string, SheetTerm>;
export type SheetTermKey = keyof typeof SHEET_TERMS;

// Each Attribute's term, in the sheet's printed order.
export const ATTRIBUTE_TERMS: Record<Attribute, SheetTermKey> = {
  S: "strength",
  T: "toughness",
  A: "agility",
  I: "initiative",
  Wil: "willpower",
  Int: "intellect",
  Fel: "fellowship",
};

// Each Skill's term (Core pp.121–127), as the sheet spells the Skill.
export const SKILL_TERMS: Record<Skill, SheetTermKey> = {
  Athletics: "athletics",
  Awareness: "awareness",
  "Ballistic Skill": "ballisticSkill",
  Cunning: "cunning",
  Deception: "deception",
  Insight: "insight",
  Intimidation: "intimidation",
  Investigation: "investigation",
  Leadership: "leadership",
  Medicae: "medicae",
  Persuasion: "persuasion",
  Pilot: "pilot",
  "Psychic Mastery": "psychicMastery",
  Scholar: "scholar",
  Stealth: "stealth",
  Survival: "survival",
  Tech: "tech",
  "Weapon Skill": "weaponSkill",
};
