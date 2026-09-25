import type { BuildStep, PsychicPower, Requirement, ResolvedBuild } from "@wg/shared";

import type { Draft, Lookups } from "./builder-context";
import { ATTRIBUTE_NAMES, BUILDER_STEPS, type BuilderStep } from "./constants";

// The screens this build needs: Creation Ascension only when the archetype's Tier is below the campaign's (Core p.148).
export function stepsFor({ draft, lookups, tier }: { draft: Draft; lookups: Lookups; tier: number }): BuilderStep[] {
  const a = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  return BUILDER_STEPS.filter((s) => s !== "ascension" || (a !== undefined && a.tier < tier));
}

// What still blocks a step: choices left and problems that aren't the GM's tick.
export const leftIn = (r: ResolvedBuild | null, step: BuildStep) =>
  r ? r.pending.filter((p) => p.step === step).length + r.problems.filter((p) => p.step === step).length : 0;

// Case-insensitive match of a search box against any of the texts.
export const matches = (q: string, ...texts: string[]) => {
  const n = q.trim().toLowerCase();
  return !n || texts.some((t) => t.toLowerCase().includes(n));
};

// Adds x to the list, or takes it out.
export const toggle = <T>(list: readonly T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

// "adeptus-astartes" → "Adeptus Astartes", for faction ids with no record in view.
export const titleOf = (id: string) =>
  id
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

// A cite for the screen: the house rulings live in docs/rules-flow.md §11, which players know as the house rules.
export const citeLabel = (cite: string) => cite.replace(/^rules-flow\.md /, "house rule ");

// A requirement as one short phrase, for the rules text under a list row ("Survival 2", "ADEPTUS ASTARTES").
export function requirementText(r: Requirement): string {
  switch (r.kind) {
    case "attribute":
      return `${ATTRIBUTE_NAMES[r.attribute]} ${r.min}`;
    case "skill":
      return `${r.skill} ${r.min}`;
    case "chosenAttribute":
    case "chosenSkill":
      return `the chosen rating ${r.min}`;
    case "influence":
      return `Influence ${r.min}`;
    case "keyword":
      return r.anyOf.join(" or ");
    case "notKeyword":
      return `not ${r.anyOf.join(" or ")}`;
    case "species":
    case "archetype":
    case "subFaction":
    case "talent":
    case "power":
      return r.anyOf.map(titleOf).join(" or ");
    case "notSpecies":
    case "notArchetype":
    case "notTalent":
      return `not ${r.anyOf.map(titleOf).join(" or ")}`;
    case "memorableInjuries":
      return r.min ? `${r.min}+ Memorable Injuries` : `at most ${r.max} Memorable Injuries`;
    case "talentCategory":
      return `${r.min} ${r.category} talent${r.min > 1 ? "s" : ""}`;
    case "option":
      return r.anyOf.join(" or ");
    case "powerCount":
      return `${r.min} powers${r.sameDiscipline ? " from one Discipline" : ""}`;
    case "wargear":
    case "wargearKeyword":
      return `owns ${r.anyOf.join(" or ")}`;
    case "wargearCount":
      return `${r.min}+ matching wargear`;
    case "rank":
      return `Rank ${r.min}`;
    case "tier":
      return r.min !== undefined && r.max !== undefined
        ? `Tier ${r.min}–${r.max}`
        : r.min !== undefined
          ? `Tier ${r.min}+`
          : `Tier ${r.max} or below`;
    case "gm":
      return `${r.text} (GM)`;
    case "all":
      return r.of.map(requirementText).join(" and ");
    case "either":
      return `either ${r.of.map(requirementText).join(", or ")}`;
  }
}

// Rules text for a Talent, package or other record: what it needs, then what it does, as printed.
export const rulesText = ({ requires, effect }: { requires?: Requirement[]; effect: string }) =>
  [requires?.length ? `Requires: ${requires.map(requirementText).join("; ")}.` : "", effect]
    .filter(Boolean)
    .join("\n\n");

// A psychic power's profile and effect, as its entry prints them (Core pp.257–267).
export const powerText = (p: PsychicPower) =>
  [
    `DN ${p.dn} · Activation ${p.activation} · Duration ${p.duration} · Range ${p.range}` +
      (p.multiTarget ? ` · Multi-target ${p.multiTarget === true ? "yes" : p.multiTarget}` : ""),
    p.tags.length ? `Keywords: ${p.tags.join(", ")}` : "",
    rulesText(p),
    p.potency.length ? `Potency:\n${p.potency.map((x) => `• ${x}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
