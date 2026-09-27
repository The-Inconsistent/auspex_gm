import { sourceCite, type Creation, type Rule, type Source } from "@wg/shared";

// A book rule as a hand-made sheet stores it (CharacterStats.abilities and .talents), plus where the picker found it.
export type SheetRuleOption = { id: string; name: string; text: string; page: string; from: string };

type Owner = { id: string; name: string; source: Source; page: number };
type Lists = Pick<Creation, "species" | "archetypes" | "sub-factions" | "option-groups" | "talents">;

// The cite resolveBuild writes (build.ts addRule): the rule's own page, in its own book or its owner's, else the owner's.
const citeOf = (r: Rule, o: Owner) =>
  r.page ? sourceCite({ source: r.source ?? o.source, page: r.page }) : sourceCite(o);

const fromOwner = (kind: string, o: Owner, rules: Rule[]): SheetRuleOption[] =>
  rules.map((r) => ({
    id: `${kind}/${o.source}/${o.id}/${r.name}`,
    name: r.name,
    text: r.text,
    page: citeOf(r, o),
    from: `${kind}: ${o.name}`,
  }));

const byName = (a: SheetRuleOption, b: SheetRuleOption) => a.name.localeCompare(b.name) || a.from.localeCompare(b.from);

// What PARTY's EDIT offers for a hand-made sheet, sorted by name. Abilities are the lists resolveBuild puts on a sheet:
// Species and Archetype abilities, Sub-faction traits and option-group options (Kroot Mutations, Asuryani Paths).
export function sheetRules(c: Lists) {
  const abilities = [
    ...c.species.flatMap((s) => fromOwner("Species", s, s.abilities)),
    ...c.archetypes.flatMap((a) => fromOwner("Archetype", a, a.abilities)),
    ...c["sub-factions"].flatMap((s) => fromOwner("Sub-faction", s, s.traits)),
    ...c["option-groups"].flatMap((g) => fromOwner("Option", g, g.options)),
  ].sort(byName);
  const talents = c.talents
    .map((t) => ({
      id: `Talent/${t.source}/${t.id}`,
      name: t.name,
      text: t.effect,
      page: sourceCite(t),
      from: t.category === "talent" ? "Talent" : t.category.toUpperCase(),
    }))
    .sort(byName);
  return { abilities, talents };
}
export type SheetRules = ReturnType<typeof sheetRules>;
