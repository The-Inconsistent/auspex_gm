"use client";
import { useState } from "react";

import { ATTRIBUTES, advancedBonusXp, archetypeAbilityXp, sourceCite, type Archetype } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { offered, rulesText, titleOf, toggle } from "../../utils";
import { RecordList } from "@/components/ui/record-list/record-list";
import { StepChoices } from "../step-choices/step-choices";

// Choose your Archetype (Core pp.21–22). Its XP already includes its species' (p.29); a lower Tier than the campaign's
// is allowed and adds Creation Ascension (p.22). Or Advanced Creation (pp.38–39): no Archetype, a species, the Tier × 10
// bonus, and an optional Archetype Ability or Wargear kit.
export function ArchetypeStep() {
  const { draft, update, lookups, tier, go } = useBuilder();
  const [all, setAll] = useState(false);
  const archetypes = [...lookups.archetypes.values()]
    .filter((a) => all || a.tier <= tier)
    .sort((a, b) => a.factionId.localeCompare(b.factionId) || a.tier - b.tier || a.name.localeCompare(b.name));
  const chosen = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;

  // Picking an archetype starts its purchases and choices afresh: they were priced from the old one's ratings.
  const advanced = draft.advanced;
  const startAdvanced = () =>
    update((d) =>
      d.advanced ? d : { tier: d.tier, name: d.name, advanced: { wargear: [] }, gm: d.gm, languages: d.languages },
    );
  const pick = (id: string) =>
    update((d) =>
      d.archetypeId === id
        ? d
        : { tier: d.tier, name: d.name, archetypeId: id, background: undefined, gm: d.gm, languages: d.languages },
    );

  return (
    <div className="stack">
      <div className="rule">CHOOSE YOUR ARCHETYPE</div>
      <div className="keys">
        <button className={`btn sm ${advanced ? "primary" : ""}`} aria-pressed={!!advanced} onClick={startAdvanced}>
          ADVANCED CREATION (NO ARCHETYPE)
        </button>
      </div>
      {advanced && <AdvancedPanel />}
      {chosen && <ArchetypeCard a={chosen} />}
      {chosen && chosen.speciesIds.length > 1 && (
        <fieldset className="panel pad stack">
          <legend className="label">SPECIES · {sourceCite(chosen)}</legend>
          <div className="keys" role="group" aria-label="Species">
            {chosen.speciesIds.map((s) => (
              <button
                key={s}
                className={`btn sm ${draft.speciesId === s ? "primary" : ""}`}
                aria-pressed={draft.speciesId === s}
                onClick={() => update((d) => ({ ...d, speciesId: s }))}
              >
                {lookups.species.get(s)?.name ?? s}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <StepChoices step="archetype" title="STARTING WARGEAR AND OTHER CHOICES" />
      {(chosen || advanced) && (
        <div>
          <button className="btn primary" onClick={() => go("customise")}>
            NEXT: CUSTOMISE
          </button>
        </div>
      )}
      <div className="rule">{chosen || advanced ? "OR AN ARCHETYPE" : "ARCHETYPES"}</div>
      <div className="keys" role="group" aria-label="Tier filter">
        <button className={`btn sm ${all ? "" : "primary"}`} aria-pressed={!all} onClick={() => setAll(false)}>
          TIER ≤ {tier}
        </button>
        <button className={`btn sm ${all ? "primary" : ""}`} aria-pressed={all} onClick={() => setAll(true)}>
          ALL
        </button>
      </div>
      <RecordList
        label="Search archetypes"
        searchable
        items={archetypes.map((a) => ({
          id: a.id,
          label: a.name,
          meta: `${titleOf(a.factionId)} · Tier ${a.tier}${a.tier < tier ? " (+ Ascension)" : ""} · ${sourceCite(a)}`,
          xp: a.xp,
          blocked: a.tier > tier ? `above Tier ${tier}` : undefined,
          detail: rulesText({
            requires: a.requires,
            effect: a.abilities.map((r) => `${r.name}. ${r.text}`).join("\n\n"),
          }),
        }))}
        selected={draft.archetypeId ? [draft.archetypeId] : []}
        onPick={pick}
      />
    </div>
  );
}

// Advanced Creation (Core pp.38–39): the species (its XP is paid, rules-flow.md §11.126), an Archetype Ability the GM
// agrees to (§11.131) and the kit that replaces an Archetype's (§11.128–130). What is allowed is `resolveBuild`'s.
function AdvancedPanel() {
  const { draft, update, lookups, catalogue, tier, homebrew } = useBuilder();
  const advanced = draft.advanced!;
  const set = (patch: Partial<NonNullable<typeof draft.advanced>>) =>
    update((d) => ({ ...d, advanced: { ...d.advanced, ...patch } }));
  const wargear = advanced.wargear ?? [];
  // Only entries with a printed Value and Rarity can be counted against the table (p.39).
  // ponytail: Core p.39's optional EXTRA WARGEAR sidebar (swap a piece for one of equal or lesser Value and Rarity that
  // shares a Keyword) is left out; the GM swaps through `gm.gear`. Add a swap check when a table asks for the rule.
  const kit = offered({ list: catalogue.wargear.values(), taken: wargear, homebrew })
    .filter((w) => w.value !== null && w.rarity !== null && w.kind !== "upgrade")
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <fieldset className="panel pad stack">
        <legend className="label">SPECIES · Core p.38 · +{advancedBonusXp(tier)} XP, no Archetype Ability</legend>
        <div className="keys" role="group" aria-label="Species">
          {offered({ list: lookups.species.values(), taken: draft.speciesId ? [draft.speciesId] : [], homebrew }).map(
            (s) => (
              <button
                key={s.id}
                className={`btn sm ${draft.speciesId === s.id ? "primary" : ""}`}
                aria-pressed={draft.speciesId === s.id}
                onClick={() => update((d) => ({ ...d, speciesId: s.id }))}
              >
                {s.name} · {s.xp} XP
              </button>
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="panel pad stack">
        <legend className="label">BUY AN ARCHETYPE ABILITY (GM AGREES) · Core p.38</legend>
        <RecordList
          label="Search archetypes for an ability"
          searchable
          items={offered({
            list: lookups.archetypes.values(),
            taken: advanced.abilityOf ? [advanced.abilityOf] : [],
            homebrew,
          })
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => ({
              id: a.id,
              label: a.name,
              meta: `Tier ${a.tier} · ${sourceCite(a)}`,
              xp: archetypeAbilityXp(a.tier),
              detail: a.abilities.map((r) => `${r.name}. ${r.text}`).join("\n\n"),
            }))}
          selected={advanced.abilityOf ? [advanced.abilityOf] : []}
          onPick={(id) => set({ abilityOf: advanced.abilityOf === id ? undefined : id })}
        />
      </fieldset>
      <fieldset className="panel pad stack">
        <legend className="label">WARGEAR · Core p.39 · common clothing and a trinket come free</legend>
        <RecordList
          label="Search wargear"
          searchable
          items={kit.map((w) => ({
            id: w.id,
            label: w.name,
            meta: `Value ${w.value} · ${w.rarity} · ${sourceCite(w)}`,
          }))}
          selected={wargear}
          onPick={(id) => set({ wargear: toggle(wargear, id) })}
        />
      </fieldset>
    </>
  );
}

// The printed entry, as a stat block: ratings, Skills, ability names, keywords. Rules text stays in the RULES tab and
// on the saved sheet.
function ArchetypeCard({ a }: { a: Archetype }) {
  const { lookups, role } = useBuilder();
  const species = a.speciesIds.map((s) => lookups.species.get(s)?.name ?? s).join(" or ");
  return (
    <div className="sb">
      <div className="sb-title">
        <span>{a.name.toUpperCase()}</span>
        <i>
          Tier {a.tier} · {a.xp} XP · {sourceCite(a)}
        </i>
      </div>
      <div className="sb-body">
        <div>
          Species <b>{species}</b> · Influence {a.influence ?? "–"}
        </div>
        <div>
          {a.keywords.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <span className="kw">{k}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="sb-grid" style={{ gridTemplateColumns: `repeat(${ATTRIBUTES.length}, minmax(0, 1fr))` }}>
        {ATTRIBUTES.map((k) => (
          <span key={k} className="sb-head">
            {k.toUpperCase()}
          </span>
        ))}
        {ATTRIBUTES.map((k) => (
          <span key={k} className="sb-v">
            {a.attributes[k] ?? "–"}
          </span>
        ))}
      </div>
      <div className="sb-band">SKILLS</div>
      <div className="sb-body">
        {Object.entries(a.skills)
          .map(([k, v]) => `${k} ${v}`)
          .join(" · ")}
      </div>
      <div className="sb-band">ABILITY</div>
      <div className="sb-body">{a.abilities.map((r) => r.name).join(", ")}</div>
      {role === "gm" && a.note && <div className="sb-body dim bld-cite">{a.note}</div>}
    </div>
  );
}
