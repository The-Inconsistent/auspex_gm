"use client";
import { sourceCite, type Archetype } from "@wg/shared";

import { RecordList } from "@/components/ui/record-list/record-list";

import { useBuilder } from "../../builder-context";
import { citeLabel, rulesText, titleOf } from "../../utils";
import { StepChoices } from "../step-choices/step-choices";

// Ascension, at creation and in play, on one screen because the book's step is the same one (Core p.148).
// - Creation Ascension (rules-flow.md §11.54): an archetype below the campaign's Tier takes one Ascension Package.
// - In play (§11.55): once the group Ascends, the character takes one Ascension Package for that Ascension, however many
//   Tiers it crossed, or goes through Archetype Ascension (Core p.155, §11.64).
// What is required, priced and allowed is `resolveBuild`'s: this screen offers the choices and shows what it says.
export function AscensionStep() {
  const { draft, lookups, tier, go, ascending } = useBuilder();
  const arch = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  if (!arch) return <p>Choose an archetype first.</p>;
  const atCreation = arch.tier < tier;

  return (
    <div className="stack">
      <div className="rule">ASCENSION</div>
      <StepChoices step="ascension" />
      {ascending && <PlayAscension arch={arch} />}
      {atCreation && <CreationAscension arch={arch} />}
      {!ascending && !atCreation && (
        <p className="dim">
          Nothing to Ascend: {arch.name} is Tier {arch.tier}, the same as this build, and the group hasn&apos;t Ascended
          since (Core p.148).
        </p>
      )}
      <div>
        <button className="btn primary" onClick={() => go(ascending ? "advance" : "detail")}>
          NEXT: {ascending ? "ADVANCE" : "DETAIL"}
        </button>
      </div>
    </div>
  );
}

// The group's Ascension, spent from the XP earned in play: one Ascension Package, or Archetype Ascension.
function PlayAscension({ arch }: { arch: Archetype }) {
  const { draft, update, lookups, tier, play, resolved } = useBuilder();
  const now = play?.tier ?? tier; // the Tier Ascended to: "× the new Tier" is priced at it (§11.55)
  const waived = play?.packageWaived === true; // the GM waived this Ascension's package (Core p.148 step 2)
  const rank = resolved?.advancement?.rank ?? 1;
  const chosen = (draft.advancement?.packages ?? []).filter((id) => lookups.packages.get(id)?.kind === "ascension");
  const ascended = draft.advancement?.archetypeAscension?.archetypeId;
  const ascensions = [...lookups.packages.values()]
    .filter((p) => p.kind === "ascension")
    .sort((a, b) => a.name.localeCompare(b.name));
  // "An Archetype of their Faction" is the same `factionId` (§11.64), at the Tier Ascended to (Core p.155).
  const archetypes = [...lookups.archetypes.values()]
    .filter((a) => a.factionId === arch.factionId && a.tier === now && a.id !== arch.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  // One Ascension Package for this Ascension (Core p.148): picking another replaces it, and the Advancement Packages
  // bought on ADVANCE stay where they are.
  const pickPackage = (id: string) =>
    update((d) => {
      const others = (d.advancement?.packages ?? []).filter((p) => lookups.packages.get(p)?.kind !== "ascension");
      return { ...d, advancement: { ...d.advancement, packages: chosen.includes(id) ? others : [...others, id] } };
    });

  // Archetype Ascension (Core p.155): the new Archetype, or none — tapping the chosen one again takes it back.
  const pickArchetype = (id: string) =>
    update((d) => ({
      ...d,
      advancement: {
        ...d.advancement,
        archetypeAscension: d.advancement?.archetypeAscension?.archetypeId === id ? undefined : { archetypeId: id },
      },
    }));

  return (
    <div className="stack">
      <div className="panel pad stack">
        <b>
          The group has Ascended to Tier {now}; {arch.name} was made at Tier {tier}.
        </b>
        <span>
          Take <b>one</b> Ascension Package for this Ascension, however many Tiers it crossed (Core p.148,{" "}
          {citeLabel("rules-flow.md §11.55")}), <b>or</b> go through Archetype Ascension (Core p.155). The rest of the
          XP earned is spent on ADVANCE.
        </span>
        {waived && (
          <span className="accent">
            Your GM waived the Ascension Package for this Ascension (Core p.148 step 2). Taking one anyway is allowed.
          </span>
        )}
      </div>

      <section className="stack">
        <div className="tbar">
          <span>ASCENSION PACKAGE</span>
          <span>Core p.148 · &times; the new Tier is &times; {now}</span>
        </div>
        <RecordList
          label="Search ascension packages"
          searchable
          items={ascensions.map((p) => ({
            id: p.id,
            label: p.name,
            meta: sourceCite(p),
            detail: rulesText(p),
            xp: typeof p.xp === "number" ? p.xp : "perTier" in p.xp ? p.xp.perTier * now : undefined,
          }))}
          selected={chosen}
          onPick={pickPackage}
        />
      </section>

      <section className="stack">
        <div className="tbar">
          <span>ARCHETYPE ASCENSION</span>
          <span>Core p.155</span>
        </div>
        <div className="dim">
          Instead of a package: an Archetype of the same Faction ({titleOf(arch.factionId)},{" "}
          {citeLabel("rules-flow.md §11.64")}) at Tier {now}. It needs Rank 3 (this character is Rank {rank}) and the
          GM&apos;s agreement, and XP is spent until the Attributes and Skills equal or exceed the new Archetype&apos;s;
          it grants that Archetype&apos;s abilities, Wargear and Influence, and none of its Attribute or Skill bonuses.
        </div>
        {archetypes.length === 0 ? (
          <div className="dim">
            No Tier {now} Archetype in the catalogue names {titleOf(arch.factionId)}, so there is no Archetype Ascension
            to take.
          </div>
        ) : (
          <RecordList
            label="Search archetypes to ascend into"
            searchable
            items={archetypes.map((a) => ({
              id: a.id,
              label: a.name,
              meta: `Tier ${a.tier} · ${sourceCite(a)}`,
              detail: rulesText({
                requires: a.requires,
                effect: a.abilities.map((r) => `${r.name}. ${r.text}`).join("\n\n"),
              }),
            }))}
            selected={ascended ? [ascended] : []}
            onPick={pickArchetype}
          />
        )}
      </section>
    </div>
  );
}

// Creation Ascension (Core p.148, rules-flow.md §11.54): an archetype below the campaign's Tier takes one Ascension
// Package, then the rest of the XP is spent as usual. The character still starts at Rank 1.
function CreationAscension({ arch }: { arch: Archetype }) {
  const { draft, update, lookups, tier } = useBuilder();
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
      <div className="tbar">
        <span>CREATION ASCENSION</span>
        <span>Core p.148</span>
      </div>
      <p>
        {arch.name} is Tier {arch.tier}; the campaign is Tier {tier}. Take <b>one</b> Ascension Package; its
        requirements are met at Tier {arch.tier}, and a price “× the new Tier” is × {tier}.
      </p>
      <RecordList
        label="Search creation ascension packages"
        searchable
        items={ascensions.map((p) => ({
          id: p.id,
          label: p.name,
          // atCreationWith turns on a choice made after the pick, so the build checks it; the meta says so up front
          // (rules-flow.md §11.61)
          meta:
            p.notAtCreation && p.atCreationWith
              ? `${sourceCite(p)} · at creation: ${p.atCreationWith} only`
              : sourceCite(p),
          detail: rulesText(p),
          xp: typeof p.xp === "number" ? p.xp : "perTier" in p.xp ? p.xp.perTier * tier : undefined,
          blocked: p.notAtCreation && !p.atCreationWith ? "not at creation" : undefined,
        }))}
        selected={chosen}
        onPick={pick}
      />
    </div>
  );
}
