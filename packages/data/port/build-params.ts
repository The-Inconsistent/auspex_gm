// The ledger builder's parameters for InconsisTable (its ADR 0011): every number, name and cite this repo's own
// `resolveBuild` (packages/shared/src/build.ts) reads, as the port's `BuildParams` input. Each value is imported from
// the constant that holds it; where build.ts only has a literal, the literal is written here with the line it comes from.
import {
  ADVANCED_WARGEAR,
  ATTRIBUTE_NAMES,
  ATTRIBUTE_XP,
  ATTRIBUTES,
  BACKGROUND_ROWS,
  Bonus,
  CREATION_TYPES,
  LANGUAGE_XP,
  MAX_BOUGHT_WEALTH,
  MELEE_MAX_REACH,
  Mods,
  RARITY_DN,
  SKILL_XP,
  SKILLS,
  SOURCES,
  SubFactionType,
  TalentCategory,
  Tier,
  UPGRADE_SLOTS,
  WEALTH_XP,
  WargearKind,
  advancedBonusXp,
  archetypeAbilityXp,
  rankOf,
  startingXp,
  type Skill,
} from "@wg/shared";

// The XP that first gives Rank 2, and the top Rank, read off `rankOf` (creation.ts) rather than retyped.
const xpPerRank = Array.from({ length: 1000 }, (_, xp) => xp).find((xp) => rankOf(xp) > 1)!;
const topRank = rankOf(Number.MAX_SAFE_INTEGER);

// The Species schema's own enums and caps (creation.ts), which creation.ts does not export by name.
const speciesShape = CREATION_TYPES.species.shape;
const speciesSizes = speciesShape.size.unwrap().options;
const speciesCapTop = speciesShape.max.unwrap().shape.S.maxValue!;

export function buildParams() {
  return {
    vocabulary: {
      attributes: ATTRIBUTES.map((id) => ({ id, name: ATTRIBUTE_NAMES[id] })),
      skills: (Object.keys(SKILLS) as Skill[]).map((name) => ({ name, attribute: SKILLS[name] })),
      mods: Mods.keyof().options.map((key) => ({
        key,
        // build.ts:2259-2260 (`bonusName`): the three Traits whose label is not the key capitalised.
        ...(key === "maxWounds" && { label: "Max Wounds" }),
        ...(key === "maxShock" && { label: "Max Shock" }),
        ...(key === "passiveAwareness" && { label: "Passive Awareness" }),
        backgroundBonus: (Bonus.options as readonly string[]).includes(key),
      })),
      subFactionTypes: [...SubFactionType.options],
      talentCategories: [...TalentCategory.options],
      speciesSizes: [...speciesSizes],
      wargearKinds: [...WargearKind.options],
      upgradeSlots: [...UPGRADE_SLOTS],
      backgroundRows: [...BACKGROUND_ROWS],
    },
    sources: {
      pageSep: " p.", // source.ts:25 (`sourceCite`), and build.ts:480 splits a cite on it
      list: Object.entries(SOURCES).map(([id, s]) => ({ id, cite: s.cite, official: s.official })),
    },
    tiers: { min: Tier.minValue!, max: Tier.maxValue! },
    startingXp: { perTier: startingXp(1), cite: "Core p.20" }, // build.ts:1843
    rank: { xpPerRank, top: topRank, cite: "Core pp.146–147" }, // creation.ts:29, the comment on `rankOf`
    attributeXp: { table: [...ATTRIBUTE_XP], cite: "Core p.24" }, // build.ts:1624, 1649
    skillXp: { table: [...SKILL_XP], cite: "Core p.25" }, // build.ts:1635, 1664
    speciesMax: { capTop: speciesCapTop, cite: "Core p.25" }, // build.ts:1678
    treeOfLearning: { enabled: true, cite: "Core p.26" }, // build.ts:1688, 1696
    wealth: {
      xp: WEALTH_XP,
      maxBought: MAX_BOUGHT_WEALTH,
      startingPerTier: 1, // build.ts:446: `wealth: tier`
      cite: "Core p.38", // build.ts:1786
    },
    languages: {
      xp: LANGUAGE_XP,
      freeFromKeywords: 1, // build.ts:1723: `(qualifying.length ? 1 : 0)`
      cite: "Core p.31", // build.ts:1731, 1743, 1753, 1769, 1776
    },
    background: { bonusAmount: 1 }, // build.ts:1363-1365: `+= 1`
    advanced: {
      bonusXpPerTier: advancedBonusXp(1),
      abilityXpPerTier: archetypeAbilityXp(1),
      wargear: {
        rows: Object.values(ADVANCED_WARGEAR).map((r) => ({ ...r })),
        cite: "Core p.39", // build.ts:1045
      },
    },
    archetypeAscension: {
      minRank: 3, // build.ts:1238: `rank < 3`
      cite: "Core p.155", // build.ts:1253
    },
    rarity: {
      order: Object.keys(RARITY_DN), // build.ts:2150, most common first
      rare: "Rare", // wargear.ts:469
      veryRare: "Very Rare", // wargear.ts:470
      refused: ["Unique"], // wargear.ts:471
    },
    keywords: {
      geneSeedSkip: "PRIMARIS", // build.ts:1428
      any: "[ANY]", // build.ts:810
      anyTwo: "[ANY 2]", // build.ts:1444
      placeholderMarker: "[", // build.ts:1432, 2096
      placeholderCite: "Core p.375", // build.ts:1438
    },
    links: {
      influence: "Fel", // build.ts:1804, 1910
      poweredArmour: "S", // build.ts:1860
    },
    weapon: {
      meleeMaxReach: MELEE_MAX_REACH,
      thrownTrait: "Thrown ({m} m)", // wargear.ts:120 (`thrownTrait`)
    },
    movementTrait: String.raw`^\+(\d+) M(?:ovement)?$`, // build.ts:2380 (`movement`)
    defaultSpeed: 6, // build.ts:1929: `species?.speed ?? 6`
    cites: {
      archetypeTier: "Core p.21", // build.ts:890
      advancedCreation: "Core p.38", // build.ts:911, 927, 969, 1004, 1012, 1075, 1100, 1449
      advancedWargear: "Core p.39", // build.ts:1021, 1028, 1045, 1047
      creationAscension: "Core p.148", // build.ts:1064, 1075, 1168, 1236, 1311
      ascensionSteps: "Core pp.148, 155", // build.ts:1175
      archetypeAscension: "Core p.155", // build.ts:1253, 1261, 1276, 1283, 1716
      archetypeAscensionRank: "Core pp.146, 155", // build.ts:1243
      advancementXp: "Core p.146", // build.ts:1836
      background: "Core p.30", // build.ts:1324
      speciesMax: "Core p.25", // build.ts:1678
      gm: "GM", // build.ts:1510
      backgroundBonus: "rules-flow.md §11.22", // build.ts:1377
      writeInKeyword: "rules-flow.md §11.25", // build.ts:1477
      writeInLanguage: "rules-flow.md §11.50", // build.ts:1763
    },
  };
}
