"use client";
import {
  ATTRIBUTE_XP,
  ATTRIBUTES,
  SKILL_XP,
  SKILLS,
  sourceCite,
  type Attribute,
  type Skill,
  type XpCost,
} from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { ATTRIBUTE_NAMES } from "../../constants";
import { powerText, rulesText, toggle } from "../../utils";
import { RecordList } from "../record-list/record-list";
import { StepChoices } from "../step-choices/step-choices";

const MAX_SKILL = 8; // the sheet's Skill ratings (Core p.25)
const MAX_ATTRIBUTE = 12; // ATTRIBUTE_XP's last rating (Core p.24)

// A price as the book prints it, for the lists: "20", "10 × Tier", "5 (at creation)", "10 or 20".
const xpLabel = (x: XpCost) =>
  typeof x === "number"
    ? String(x)
    : "perTier" in x
      ? `${x.perTier} × Tier`
      : "atCreation" in x
        ? `${x.atCreation} at creation`
        : "base" in x
          ? `${x.base} + ${x.plus}`
          : x.byChoice.map((c) => c.xp).join(" or ");

// Customise (Core pp.22–26): Attributes and Skills bought with XP, Talents, psychic powers and Advancement Packages.
export function CustomiseStep() {
  const { draft, update, resolved: r, lookups, go } = useBuilder();
  const arch = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  if (!arch || !r)
    return (
      <div className="stack">
        <p>Choose an archetype first.</p>
        <div>
          <button className="btn primary" onClick={() => go("archetype")}>
            GO TO ARCHETYPE
          </button>
        </div>
      </div>
    );
  const speciesId = draft.gm?.species ?? draft.speciesId ?? arch.speciesIds[0];
  const max = (speciesId ? lookups.species.get(speciesId)?.max : undefined) ?? undefined;
  const sheet = r.sheet;
  const psyker = sheet.keywords.includes("PSYKER");

  // USE SUGGESTIONS: the archetype's suggested Attributes, Skills and Talents (Core p.22), bought in one go.
  const useSuggestions = () =>
    update((d) => ({
      ...d,
      attributes: { ...d.attributes, ...arch.suggested?.attributes },
      skills: { ...d.skills, ...arch.suggested?.skills },
      talents: [
        ...(d.talents ?? []),
        ...(arch.suggested?.talentIds ?? [])
          .filter((t) => lookups.talents.has(t) && !d.talents?.some((x) => x.id === t))
          .map((id) => ({ id })),
      ],
    }));

  // − / + on a rating: sets the rating to buy up to; below what's granted buys nothing.
  const rate = (kind: "attributes" | "skills", key: string, to: number) =>
    update((d) => ({ ...d, [kind]: { ...d[kind], [key]: to } }));

  // A Talent's bracket choice ("smell", "Orks", the Trademark Weapon's name).
  const setTalentChoice = (i: number, choice: string) =>
    update((d) => ({
      ...d,
      talents: (d.talents ?? []).map((t, j) => (j === i ? { ...t, choice: choice || undefined } : t)),
    }));

  const bought = draft.talents ?? [];
  const attrRow = (a: Attribute) => {
    const v = sheet.attributes[a];
    const cap = max?.[a] ?? MAX_ATTRIBUTE;
    const buying = (draft.attributes?.[a] ?? 0) >= v && draft.attributes?.[a] !== undefined;
    return (
      <div key={a} className="bld-rate">
        <span>
          <b>{a.toUpperCase()}</b> <span className="dim bld-cite">max {cap}</span>
        </span>
        <span className="bld-v">{v}</span>
        <button
          className="btn sq sm"
          aria-label={`Lower ${ATTRIBUTE_NAMES[a]}`}
          disabled={!buying}
          onClick={() => rate("attributes", a, v - 1)}
        >
          −
        </button>
        <button
          className="btn sq sm"
          aria-label={`Raise ${ATTRIBUTE_NAMES[a]}`}
          disabled={v >= cap}
          onClick={() => rate("attributes", a, v + 1)}
        >
          +
        </button>
        <span className="dim bld-cite">{v < cap ? `+${ATTRIBUTE_XP[v + 1]! - ATTRIBUTE_XP[v]!} XP` : "max"}</span>
      </div>
    );
  };
  const skillRow = (k: Skill) => {
    const v = sheet.skills[k] ?? 0;
    const buying = (draft.skills?.[k] ?? -1) >= v && draft.skills?.[k] !== undefined && v > 0;
    return (
      <div key={k} className="bld-rate">
        <span>
          <b>{k}</b>{" "}
          <span className="dim bld-cite">
            ({SKILLS[k]}) pool {v + sheet.attributes[SKILLS[k]]}
          </span>
        </span>
        <span className="bld-v">{v}</span>
        <button
          className="btn sq sm"
          aria-label={`Lower ${k}`}
          disabled={!buying}
          onClick={() => rate("skills", k, v - 1)}
        >
          −
        </button>
        <button
          className="btn sq sm"
          aria-label={`Raise ${k}`}
          disabled={v >= MAX_SKILL}
          onClick={() => rate("skills", k, v + 1)}
        >
          +
        </button>
        <span className="dim bld-cite">{v < MAX_SKILL ? `+${SKILL_XP[v + 1]! - SKILL_XP[v]!} XP` : "max"}</span>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="rule">CUSTOMISE</div>
      {arch.suggested && (
        <div className="panel pad keys" style={{ alignItems: "center" }}>
          <span style={{ flex: "1 1 220px" }}>
            Buy the archetype&apos;s suggested Attributes, Skills and Talents in one go (Core p.22).
          </span>
          <button className="btn" onClick={useSuggestions}>
            USE SUGGESTIONS
          </button>
        </div>
      )}
      <StepChoices step="customise" />

      <section className="stack">
        <div className="tbar">
          <span>ATTRIBUTES</span>
          <span>Core pp.24–25</span>
        </div>
        <div className="list table">{ATTRIBUTES.map(attrRow)}</div>
      </section>

      <section className="stack">
        <div className="tbar">
          <span>SKILLS</span>
          <span>Tree of Learning p.26</span>
        </div>
        <div className="list table">{(Object.keys(SKILLS) as Skill[]).map(skillRow)}</div>
      </section>

      <section className="stack">
        <div className="tbar">
          <span>TALENTS</span>
          <span>{bought.length} BOUGHT</span>
        </div>
        {bought.map((t, i) => {
          const rec = lookups.talents.get(t.id);
          return (
            <div key={`${t.id}-${i}`} className="item">
              <div className="item-head">
                <b style={{ flex: 1 }}>
                  {rec?.name ?? t.id} <span className="dim bld-cite">{rec && sourceCite(rec)}</span>
                </b>
                <span>{rec && xpLabel(rec.xp)} XP</span>
                <button
                  className="btn sq sm"
                  aria-label={`Remove ${rec?.name ?? t.id}`}
                  onClick={() => update((d) => ({ ...d, talents: bought.filter((_, j) => j !== i) }))}
                >
                  ×
                </button>
              </div>
              <input
                className="input"
                aria-label={`${rec?.name ?? t.id}: what it applies to`}
                placeholder="Applies to (a bracketed choice, a weapon…), if any"
                value={t.choice ?? ""}
                onChange={(e) => setTalentChoice(i, e.target.value)}
              />
              {rec && (
                <details>
                  <summary className="label">RULES</summary>
                  <pre className="text bld-rules">{rulesText(rec)}</pre>
                </details>
              )}
            </div>
          );
        })}
        <RecordList
          label="Search talents"
          searchable
          items={[...lookups.talents.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => ({
              id: t.id,
              label: t.name,
              meta: `${t.category === "talent" ? "" : `${t.category} · `}${sourceCite(t)} · ${xpLabel(t.xp)} XP`,
              detail: rulesText(t),
            }))}
          selected={bought.map((t) => t.id)}
          onPick={(id) =>
            update((d) => {
              const has = (d.talents ?? []).some((t) => t.id === id);
              const rec = lookups.talents.get(id);
              // A bracketed Talent may be taken again for another choice (rules-flow.md §11.29).
              return {
                ...d,
                talents:
                  has && rec?.repeatable !== "perChoice"
                    ? (d.talents ?? []).filter((t) => t.id !== id)
                    : [...(d.talents ?? []), { id }],
              };
            })
          }
        />
      </section>

      {psyker && (
        <section className="stack">
          <div className="tbar">
            <span>PSYCHIC POWERS</span>
            <span>Core p.257</span>
          </div>
          <RecordList
            label="Search psychic powers"
            searchable
            items={[...lookups.powers.values()]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => ({
                id: p.id,
                label: p.name,
                meta: `${lookups.disciplines.get(p.disciplineId)?.name ?? p.disciplineId} · ${sourceCite(p)} · ${xpLabel(p.xp)} XP`,
                detail: powerText(p),
              }))}
            selected={draft.powers ?? []}
            onPick={(id) => update((d) => ({ ...d, powers: toggle(d.powers ?? [], id) }))}
          />
        </section>
      )}

      <section className="stack">
        <div className="tbar iron">
          <span>ADVANCEMENT PACKAGES</span>
          <span>AT CREATION</span>
        </div>
        <RecordList
          label="Search advancement packages"
          items={[...lookups.packages.values()]
            .filter((p) => p.kind === "advancement")
            .map((p) => ({
              id: p.id,
              label: p.name,
              meta: sourceCite(p),
              detail: rulesText(p),
              xp: typeof p.xp === "number" ? p.xp : undefined,
              blocked: p.notAtCreation ? "not at creation" : undefined,
            }))}
          selected={draft.packages ?? []}
          onPick={(id) => update((d) => ({ ...d, packages: toggle(d.packages ?? [], id) }))}
        />
      </section>

      <div>
        <button className="btn primary" onClick={() => go("faction")}>
          NEXT: FACTION
        </button>
      </div>
    </div>
  );
}
