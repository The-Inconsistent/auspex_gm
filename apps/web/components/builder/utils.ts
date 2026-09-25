import type { BuildStep, ResolvedBuild } from "@wg/shared";

import type { Draft, Lookups } from "./builder-context";
import { BUILDER_STEPS, type BuilderStep } from "./constants";

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
