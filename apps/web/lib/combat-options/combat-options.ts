import type { RuleEntry, Weapon } from "@wg/shared";

import { weaponSkill } from "../sheet-pools/sheet-pools.ts";

// FIGHT's OPTIONS (the player's Turn), catalogued so a player reads them by what they are doing, not in page order.
// The grouping and the notes are the app's; every entry's text and page are the book's (Core pp.177–190).
export const COMBAT_OPTION_GROUPS = [
  {
    title: "YOUR TURN",
    note: "What one Turn holds. Read these first.",
    ids: [
      "actions",
      "combat-actions",
      "simple-actions",
      "free-actions",
      "reflexive-actions",
      "full-round-actions",
      "multi-actions",
    ],
  },
  {
    title: "MOVE",
    note: "Your Movement, or what you trade it for.",
    ids: [
      "movement",
      "standard-movement",
      "running",
      "sprinting",
      "crawling",
      "climbing",
      "jumping",
      "swimming",
      "flying",
      "moving-stealthily",
    ],
  },
  {
    title: "ATTACK, ANY WEAPON",
    note: "Extras for an attack, melee or ranged.",
    ids: ["attack-options", "called-shot", "multi-attack", "combined-attack"],
  },
  {
    title: "MELEE",
    note: "Fighting hand to hand.",
    ids: ["all-out-attack", "charge", "grapple", "fall-back", "reflexive-attacks"],
  },
  {
    title: "SHOOTING",
    note: "With a ranged weapon. Some need a Salvo or a Heavy weapon.",
    ids: [
      "aim",
      "brace",
      "firing-into-melee",
      "shoot-through-cover",
      "salvo-options",
      "full-auto",
      "spray-shot",
      "spray-shot-vs-mobs",
      "pinning-attack",
      "reloading",
    ],
  },
  {
    title: "NOT ATTACKING",
    note: "Unsettle a foe, guard yourself, or wait for your moment.",
    ids: [
      "interaction-attacks",
      "full-defence",
      "dodging-area-effect-attacks",
      "hold-action",
      "interrupting-initiative",
    ],
  },
  {
    title: "TURN ORDER",
    note: "Between Turns: the party's Glory, the GM's ambush.",
    ids: ["seize-the-initiative", "ambush"],
  },
] as const;

type Need = { label: string; met: (weapons: Weapon[]) => boolean };

const ranged = (w: Weapon) => weaponSkill(w) === "Ballistic Skill";
const RANGED: Need = { label: "a ranged weapon", met: (ws) => ws.some(ranged) };
// A Salvo of '–' can't use Salvo Options (p.185).
const SALVO: Need = { label: "a weapon with a Salvo", met: (ws) => ws.some((w) => ranged(w) && w.salvo != null) };

// What an option asks of the Agent's weapons, as the book words it. An option not listed needs nothing.
export const COMBAT_OPTION_NEEDS: Record<string, Need> = {
  aim: RANGED, // ranged attack Tests, p.189
  "firing-into-melee": RANGED, // p.185
  "shoot-through-cover": RANGED, // p.189
  reloading: RANGED, // one ranged weapon, p.184
  "salvo-options": SALVO,
  "full-auto": SALVO,
  "spray-shot": SALVO,
  "spray-shot-vs-mobs": SALVO, // the weapon's Salvo value, p.185
  "pinning-attack": {
    label: "a ranged weapon with Salvo 1+",
    met: (ws) => ws.some((w) => ranged(w) && (w.salvo ?? 0) >= 1), // p.189
  },
  brace: {
    label: "a Heavy weapon",
    met: (ws) => ws.some((w) => w.traits.some((t) => /^heavy\b/i.test(t))), // negates the Heavy trait, p.189
  },
};

export type CatalogueEntry = { rule: RuleEntry; needs: string | null };
export type CatalogueGroup = { title: string; note: string; entries: CatalogueEntry[]; usable: number };

// The action entries as groups for this Agent's weapons: what they can use first, then what they can't, with why. An
// entry no group names (new data) lands in OTHER, so nothing the seat is served goes missing.
export const catalogueOptions = (actions: RuleEntry[], weapons: Weapon[]): CatalogueGroup[] => {
  const byId = new Map(actions.map((r) => [r.id, r]));
  const placed = new Set<string>(COMBAT_OPTION_GROUPS.flatMap((g) => g.ids));
  const groups = [
    ...COMBAT_OPTION_GROUPS.map((g) => ({ ...g, rules: g.ids.flatMap((id) => byId.get(id) ?? []) })),
    { title: "OTHER", note: "", rules: actions.filter((r) => !placed.has(r.id)) },
  ];
  return groups.flatMap(({ title, note, rules }) => {
    if (!rules.length) return [];
    const entries = rules.map((rule) => {
      const need = COMBAT_OPTION_NEEDS[rule.id];
      return { rule, needs: need && !need.met(weapons) ? need.label : null };
    });
    const ok = entries.filter((e) => !e.needs);
    return [{ title, note, entries: [...ok, ...entries.filter((e) => e.needs)], usable: ok.length }];
  });
};
