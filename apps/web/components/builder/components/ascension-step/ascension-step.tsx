"use client";
import { sourceCite } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { RecordList } from "../record-list/record-list";
import { StepChoices } from "../step-choices/step-choices";

// Creation Ascension (Core p.148, rules-flow.md §11.54): an archetype below the campaign's Tier takes one Ascension
// Package, then the rest of the XP is spent as usual. The character still starts at Rank 1.
export function AscensionStep() {
  const { draft, update, lookups, tier, go } = useBuilder();
  const arch = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  if (!arch) return <p>Choose an archetype first.</p>;
  const ascensions = [...lookups.packages.values()].filter((p) => p.kind === "ascension");
  const chosen = (draft.packages ?? []).filter((id) => lookups.packages.get(id)?.kind === "ascension");

  // One Ascension Package: picking another replaces it; the Advancement Packages bought stay.
  const pick = (id: string) =>
    update((d) => {
      const others = (d.packages ?? []).filter((p) => lookups.packages.get(p)?.kind !== "ascension");
      return { ...d, packages: chosen.includes(id) ? others : [...others, id] };
    });

  return (
    <div className="stack">
      <div className="rule">CREATION ASCENSION</div>
      <p>
        {arch.name} is Tier {arch.tier}; the campaign is Tier {tier}. Take <b>one</b> Ascension Package; its
        requirements are met at Tier {arch.tier}, and a price “× the new Tier” is × {tier}.
      </p>
      <StepChoices step="ascension" />
      <RecordList
        label="Search ascension packages"
        searchable
        items={ascensions.map((p) => ({
          id: p.id,
          label: p.name,
          meta: sourceCite(p),
          xp: typeof p.xp === "number" ? p.xp : "perTier" in p.xp ? p.xp.perTier * tier : undefined,
          blocked: p.notAtCreation ? "not at creation" : undefined,
        }))}
        selected={chosen}
        onPick={pick}
      />
      <div>
        <button className="btn primary" onClick={() => go("detail")}>
          NEXT: DETAIL
        </button>
      </div>
    </div>
  );
}
