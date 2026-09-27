"use client";
import {
  ATTRIBUTE_XP,
  ATTRIBUTES,
  SKILL_XP,
  SKILLS,
  LANGUAGE_XP,
  sourceCite,
  type Attribute,
  type Skill,
  type XpCost,
} from "@wg/shared";

import { useBuilder, type Draft } from "../../builder-context";
import { ATTRIBUTE_NAMES } from "../../constants";
import { citeLabel, powerText, rulesText, toggle } from "../../utils";
import { RecordList } from "@/components/ui/record-list/record-list";
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

type Layer = "creation" | "advancement";
type Purchases = {
  attributes?: Partial<Record<Attribute, number>>;
  skills?: Partial<Record<Skill, number>>;
  talents?: { id: string; choice?: string }[];
  powers?: string[];
  packages?: string[];
  languages?: string[];
};
type CustomiseStepProps = { layer?: Layer };

// The purchases a screen edits: creation's, or the advancement's (the XP earned in play, issue #9 step 5).
const purchasesOf = (d: Draft, layer: Layer): Purchases =>
  layer === "creation"
    ? { attributes: d.attributes, skills: d.skills, talents: d.talents, powers: d.powers, packages: d.packages }
    : { ...d.advancement };
const withPurchases = (d: Draft, layer: Layer, p: Purchases): Draft =>
  layer === "creation" ? { ...d, ...p, languages: d.languages } : { ...d, advancement: { ...d.advancement, ...p } };

// Customise (Core pp.22–26): Attributes and Skills bought with XP, Talents, psychic powers and Advancement Packages.
// As ADVANCE, the same for the XP earned in play (Core pp.146–151): Rank from it, and an Ascension Package for each Tier
// the group has Ascended since creation (rules-flow.md §11.55).
export function CustomiseStep({ layer = "creation" }: CustomiseStepProps) {
  const { draft, update: updateDraft, resolved: r, lookups, go, tier, play } = useBuilder();
  const inPlay = layer === "advancement";
  const mine = purchasesOf(draft, layer);
  // Edits this layer's purchases.
  const update = (fn: (p: Purchases) => Purchases) =>
    updateDraft((d) => withPurchases(d, layer, fn(purchasesOf(d, layer))));
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
  const ascensionOpen = !!play && play.tier > tier;

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

  const bought = mine.talents ?? [];
  const attrRow = (a: Attribute) => {
    const v = sheet.attributes[a];
    const cap = max?.[a] ?? MAX_ATTRIBUTE;
    const buying = (mine.attributes?.[a] ?? 0) >= v && mine.attributes?.[a] !== undefined;
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
    const buying = (mine.skills?.[k] ?? -1) >= v && mine.skills?.[k] !== undefined && v > 0;
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
      <div className="rule">{inPlay ? "ADVANCE" : "CUSTOMISE"}</div>
      {inPlay && r.advancement && (
        <div className="panel pad keys" style={{ alignItems: "center" }}>
          <span style={{ flex: "1 1 220px" }}>
            <b>{r.advancement.budget} XP</b> earned in play, <b>{r.advancement.spent}</b> spent,{" "}
            <b>{r.advancement.budget - r.advancement.spent}</b> left · Rank {r.advancement.rank} (+1 per 40 XP earned,
            Core pp.146–147) · made at Tier {tier}, the group is Tier {r.advancement.tier}
          </span>
        </div>
      )}
      {!inPlay && arch.suggested && (
        <div className="panel pad keys" style={{ alignItems: "center" }}>
          <span style={{ flex: "1 1 220px" }}>
            Buy the archetype&apos;s suggested Attributes, Skills and Talents in one go (Core p.22).
          </span>
          <button className="btn" onClick={useSuggestions}>
            USE SUGGESTIONS
          </button>
        </div>
      )}
      <StepChoices step={inPlay ? "advance" : "customise"} />

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
            selected={mine.powers ?? []}
            onPick={(id) => update((d) => ({ ...d, powers: toggle(d.powers ?? [], id) }))}
          />
        </section>
      )}

      <section className="stack">
        <div className="tbar iron">
          <span>{inPlay && ascensionOpen ? "PACKAGES" : "ADVANCEMENT PACKAGES"}</span>
          <span>{inPlay ? "IN PLAY" : "AT CREATION"}</span>
        </div>
        {inPlay && ascensionOpen && (
          <div className="dim">
            The group has Ascended since this character was made: take an Ascension Package for each Tier, in order (
            {citeLabel("rules-flow.md §11.55")}).
          </div>
        )}
        <RecordList
          label="Search packages"
          searchable
          items={[...lookups.packages.values()]
            .filter((p) => p.kind === "advancement" || (inPlay && ascensionOpen))
            .map((p) => ({
              id: p.id,
              label: p.name,
              meta: `${p.kind === "ascension" ? "Ascension · " : ""}${sourceCite(p)}`,
              detail: rulesText(p),
              xp: typeof p.xp === "number" ? p.xp : undefined,
              blocked: p.notAtCreation && !inPlay ? "not at creation" : undefined,
            }))}
          selected={mine.packages ?? []}
          onPick={(id) => update((d) => ({ ...d, packages: toggle(d.packages ?? [], id) }))}
        />
      </section>

      {inPlay && (
        <section className="stack">
          <div className="tbar">
            <span>LANGUAGES</span>
            <span>{LANGUAGE_XP} XP EACH · Core p.31</span>
          </div>
          <RecordList
            label="Search languages"
            items={[...lookups.languages.values()].map((l) => ({ id: l.id, label: l.name, xp: LANGUAGE_XP }))}
            selected={mine.languages ?? []}
            onPick={(id) => update((d) => ({ ...d, languages: toggle(d.languages ?? [], id) }))}
          />
        </section>
      )}

      <div>
        <button className="btn primary" onClick={() => go(inPlay ? "review" : "faction")}>
          NEXT: {inPlay ? "REVIEW" : "FACTION"}
        </button>
      </div>
    </div>
  );
}
