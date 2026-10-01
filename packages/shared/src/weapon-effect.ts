import { z } from "zod";
import { Rarity, WargearKind } from "./requisition.ts";

// The catalogue filter and the weapon-effect vocabulary, shared by upgrades (wargear.ts), creation records
// (creation.ts) and the sheet (state.ts, which can't import creation.ts: creation.ts imports it).

// Which catalogue items qualify: "any two augmetics", "one ranged weapon of Uncommon or lower rarity", "Rare Wargear
// with a Value up to 3 + the new Tier" (Core p.151). Every field narrows; an empty filter is any item.
export const WargearFilter = z.object({
  kinds: z.array(WargearKind).min(1).optional(),
  weapon: z.enum(["melee", "ranged"]).optional(),
  categories: z.array(z.string().min(1)).min(1).optional(), // `Wargear.category`: "Augmetic Enhancements"
  nameIncludes: z.string().min(1).optional(), // "Mechadendrite", "Drone"
  wargearKeywords: z.array(z.string().min(1)).min(1).optional(), // the item has any of these (BOLT, IMPERIUM, PROJECTILE)
  // The item has *all* of these: "any weapon with the BOLT and ADEPTUS ASTARTES Keywords" (VoA p.68). `wargearKeywords`
  // is any-of, so a printed "and" needs this one or the filter is wider than the book.
  allKeywords: z.array(z.string().min(1)).min(1).optional(),
  // A printed weapon Trait the item has, by name without its rating: "any LAS weapon with the Pistol trait"
  // (Apocrypha p.389) is "Pistol", and "weapons with a Heavy (X) Trait" (IoE p.95) is "Heavy". Any of them matches. A
  // value with a bracket must match the Trait exactly as printed, so only for a bracket that names a kind, not a
  // rating: "Inflict (On Fire)" (Core p.138) isn't every Inflict.
  weaponTraits: z.array(z.string().min(1)).min(1).optional(),
  // A printed Trait the item must *not* have: "which does not have the Heavy trait" (Apocrypha p.388)
  notWeaponTraits: z.array(z.string().min(1)).min(1).optional(),
  maxValue: z
    .union([
      z.number().int().min(0),
      z.object({ tierPlus: z.number().int() }), // "a Value of your Tier +3 or lower" (Apocrypha p.128)
      z.object({ newTierPlus: z.number().int() }), // "a value of 3 + new Tier" (Core p.151)
    ])
    .optional(),
  rarity: z.object({ atMost: Rarity.optional(), atLeast: Rarity.optional() }).optional(), // "Rare" alone is both
  upgrade: z.string().min(1).optional(), // "with the Sanctified upgrade" (Apocrypha p.103)
  condition: z.string().min(1).optional(), // a GM-judged condition: "worn openly and visibly" (FSPG p.73)
});
export type WargearFilter = z.infer<typeof WargearFilter>;

// What a change to a weapon's profile can say, with its amounts as `amount`: a fixed integer for an upgrade
// (`UpgradeMod`, wargear.ts), or one that may be Rank for a Talent (`WeaponMod`). Anything a profile can't hold (an
// Action the wielder takes, a Glory spend, a Test) stays prose and takes a `gm` mod, so nothing is silently dropped.
export const weaponMods = <A extends z.ZodTypeAny>(amount: A) =>
  z.union([
    // A Trait the item gains, by rules id: "gains Sniper (2)" is { traitId: "sniper", rating: 2 }. One it already has
    // keeps the better rating.
    z.object({ kind: z.literal("trait"), traitId: z.string().min(1), rating: amount.optional() }),
    z.object({ kind: z.literal("removeTrait"), traitId: z.string().min(1) }), // "removes the Heavy Trait" (IoE p.95)
    // A rating the item already has, moved: "reduces any Rapid Fire rating by -1" (VoA p.68). Removing the Trait would
    // say something else, so this is its own mod; it does nothing to a weapon without that Trait. Before a `trait` mod
    // for the same Trait, it reads "if it already has it": Bolter Discipline (VoA p.45).
    z.object({ kind: z.literal("traitRating"), traitId: z.string().min(1), delta: amount }),
    z.object({ kind: z.literal("damage"), delta: amount }),
    z.object({ kind: z.literal("ed"), delta: amount }),
    z.object({ kind: z.literal("ap"), delta: amount }),
    // "the weapon changes its AP to -3" (Shredding Fire, Apocrypha p.251): a value, whatever the weapon had
    z.object({ kind: z.literal("setAp"), value: z.number().int().max(0) }),
    z.object({ kind: z.literal("salvo"), delta: amount }),
    // "The weapon's ranges are halved" (Apocrypha p.389) is { multiply: 0.5 }; a flat change is { delta }; a band-by-band
    // change ("+3 Short, +6 Medium, +9 Long", Apocrypha p.388) is { bands: [3, 6, 9] }, shortest first, as `range` prints
    z.object({
      kind: z.literal("range"),
      multiply: z.number().positive().optional(),
      delta: z.number().int().optional(),
      bands: z.array(z.number().int()).min(1).max(3).optional(),
    }),
    z.object({ kind: z.literal("ar"), delta: z.number().int() }), // armour only
    // "+2 bonus dice to any Attack Test made with this weapon" (Core p.228): dice the sheet shows, with when to add them
    z.object({ kind: z.literal("bonusDice"), dice: amount, when: z.string().min(1).max(200) }),
    z.object({ kind: z.literal("gm"), what: z.string().min(1).max(200) }), // the GM applies it at the table
  ]);

// A Talent's amount: fixed, Rank or Double Rank ({ perRank: 2 }), and maybe more ("Double Rank +1"). Rank is the
// character's Rank now, so these are resolved when the sheet is read (rules-flow.md §11.68).
export const RankAmount = z.union([
  z.number().int(),
  z.object({ perRank: z.number().int(), plus: z.number().int().optional() }),
]);
export type RankAmount = z.infer<typeof RankAmount>;
export const WeaponMod = weaponMods(RankAmount);
export type WeaponMod = z.infer<typeof WeaponMod>;

// Which of the character's weapons a standing effect reaches (rules-flow.md §11.68): the catalogue filter, matched
// against the weapon's own catalogue entry, plus the two that only the build knows. `chosen`: the weapon the Talent's
// choice names ("Choose one of your weapons to become a Trademark Weapon", Core p.141). `granted`: the weapon the
// record's own grant gave ("this weapon", the Doctrines, VoA p.35). `unarmed`: unarmed strikes, which have no line.
export const WeaponFits = WargearFilter.extend({
  chosen: z.literal(true).optional(),
  granted: z.literal(true).optional(),
  unarmed: z.literal(true).optional(),
});
export type WeaponFits = z.infer<typeof WeaponFits>;
// A record's entries are alternatives for one weapon: the first that fits applies, so a rule printed for "SHURIKEN
// weapons" that needs two filters (the keyword, and Inheritance of Embers' category) is never applied twice.
export const WeaponEffect = z.object({ fits: WeaponFits, mods: z.array(WeaponMod).min(1) });
export type WeaponEffect = z.infer<typeof WeaponEffect>;
