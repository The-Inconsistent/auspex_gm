import {
  CharacterBuild,
  StoredDraft,
  type BuildStep,
  type CharacterDetail,
  type Overrides,
  type PsychicPower,
  type Requirement,
  type ResolvedBuild,
} from "@wg/shared";

import type { Draft, Lookups } from "./builder-context";
import { ATTRIBUTE_NAMES, BUILDER_STEPS, type BuilderStep } from "./constants";

// The screens this build needs: Creation Ascension only when the archetype's Tier is below the campaign's (Core p.148),
// ADVANCE once the character is made. A player's made character shows only ADVANCE and REVIEW: its creation choices
// are the GM's to change.
export function stepsFor({
  draft,
  lookups,
  tier,
  made,
  locked,
}: {
  draft: Draft;
  lookups: Lookups;
  tier: number;
  made: boolean;
  locked: boolean;
}): BuilderStep[] {
  if (locked) return ["advance", "review"];
  const a = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  return BUILDER_STEPS.filter(
    (s) => (s !== "ascension" || (a !== undefined && a.tier < tier)) && (s !== "advance" || made),
  );
}

// What still blocks a step: choices left and problems that aren't the GM's tick.
export const leftIn = (r: ResolvedBuild | null, step: BuildStep) =>
  r ? r.pending.filter((p) => p.step === step).length + r.problems.filter((p) => p.step === step).length : 0;

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

// Where a builder starts from: the character's name and detail, the build it last saved, and the draft kept away from
// this device (a player's on the table, the library row's). `savedAt` (ms) is when that build was last saved (a
// table's `builtAt`, the library row's `updatedAt`).
export type DraftStart = {
  name: string;
  detail?: Partial<CharacterDetail>;
  build?: unknown;
  draft?: Draft | null;
  savedAt?: number;
};

// Which draft the builder opens on: the newer of this device's and the one saved away from it, else the saved build,
// else a blank one at `tier`. A build finished elsewhere after this device wrote its draft wins, because that draft is
// a stale half-build and the server dropped its own copy when it saved. A table's draft names the save it was opened
// on (`builtAt`), so that needs no clocks; the library's, and older ones, compare this device's time with the server's.
export function pickDraft({ local, start, tier }: { local: Draft | null; start: DraftStart; tier: number }): Draft {
  const stale =
    !!local &&
    !!start.build &&
    start.savedAt !== undefined &&
    (local.builtAt !== undefined ? local.builtAt !== start.savedAt : (local.savedAt ?? 0) < start.savedAt);
  const newest = [stale ? null : local, start.draft ?? null]
    .filter((d): d is Draft => d !== null)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  // A draft from before the builder kept the detail starts from the character's.
  if (newest) return { detail: start.detail, ...newest };
  const saved = CharacterBuild.safeParse(start.build);
  if (saved.success) return { ...saved.data, name: start.name, detail: start.detail };
  return { tier, name: start.name, detail: start.detail };
}

// A draft the builder wrote earlier, from this device's storage or from the server: parsed (`StoredDraft`, @wg/shared)
// rather than trusted, because neither store checks its shape. A draft an older builder wrote, or one that's been
// tampered with, is dropped and the builder falls back to the saved build.
export function draftOf(value: unknown): Draft | null {
  const parsed = StoredDraft.safeParse(value);
  // The name and Tier are checked above; the choices ride along for `resolveBuild` to parse.
  return parsed.success ? (parsed.data as Draft) : null;
}

// The GM's overrides to save: the live ones with only the Traits this builder changed since it opened, so a change made
// meanwhile on another device stays. Null when nothing changed.
export function mergeOverrides({ live, base, edited }: { live: Overrides; base: Overrides; edited: Overrides }) {
  const changed = (Object.keys({ ...base, ...edited }) as (keyof Overrides)[]).filter((k) => base[k] !== edited[k]);
  if (!changed.length) return null;
  const next = { ...live };
  for (const k of changed) {
    if (edited[k] === undefined) delete next[k];
    else next[k] = edited[k];
  }
  return next;
}
