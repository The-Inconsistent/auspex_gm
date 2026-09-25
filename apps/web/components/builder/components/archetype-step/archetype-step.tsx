"use client";
import { useState } from "react";

import { ATTRIBUTES, sourceCite, type Archetype } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { titleOf } from "../../utils";
import { RecordList } from "../record-list/record-list";
import { StepChoices } from "../step-choices/step-choices";

// Choose your Archetype (Core pp.21–22). Its XP already includes its species' (p.29); a lower Tier than the campaign's
// is allowed and adds Creation Ascension (p.22).
export function ArchetypeStep() {
  const { draft, update, lookups, tier, go } = useBuilder();
  const [all, setAll] = useState(false);
  const archetypes = [...lookups.archetypes.values()]
    .filter((a) => all || a.tier <= tier)
    .sort((a, b) => a.factionId.localeCompare(b.factionId) || a.tier - b.tier || a.name.localeCompare(b.name));
  const chosen = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;

  // Picking an archetype starts its purchases and choices afresh: they were priced from the old one's ratings.
  const pick = (id: string) =>
    update((d) =>
      d.archetypeId === id
        ? d
        : { tier: d.tier, name: d.name, archetypeId: id, background: undefined, gm: d.gm, languages: d.languages },
    );

  return (
    <div className="stack">
      <div className="rule">CHOOSE YOUR ARCHETYPE</div>
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
      {chosen && (
        <div>
          <button className="btn primary" onClick={() => go("customise")}>
            NEXT: CUSTOMISE
          </button>
        </div>
      )}
      <div className="rule">{chosen ? "OR ANOTHER" : "ARCHETYPES"}</div>
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
        }))}
        selected={draft.archetypeId ? [draft.archetypeId] : []}
        onPick={pick}
      />
    </div>
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
