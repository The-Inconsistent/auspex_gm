"use client";
import { BACKGROUND_ROWS, sourceCite, type BackgroundRow, type BackgroundTable, type Bonus } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { BONUS_LABELS } from "../../constants";
import { citeLabel, titleOf } from "../../utils";
import { StepChoices } from "../step-choices/step-choices";

const ROW_LABELS: Record<BackgroundRow, string> = {
  origin: "ORIGIN",
  accomplishment: "ACCOMPLISHMENT",
  goal: "GOAL",
};

// Know your Faction (Core pp.26–30): what fills each [PLACEHOLDER], the Background (three rows, one bonus,
// rules-flow.md §11.22), and the option groups the species or faction offers.
export function FactionStep() {
  const { draft, update, resolved: r, lookups, tier, go } = useBuilder();
  const arch = draft.archetypeId ? lookups.archetypes.get(draft.archetypeId) : undefined;
  if (!arch || !r) return <p>Choose an archetype first.</p>;

  const keywordByName = new Map([...lookups.keywords.values()].map((k) => [k.name, k]));
  const fills = draft.fills ?? {};
  const placeholders = [...new Set([...r.sheet.keywords.filter((k) => k.startsWith("[")), ...Object.keys(fills)])];
  const speciesId = draft.gm?.species ?? draft.speciesId ?? arch.speciesIds[0];
  const subFactionIds = Object.values(fills).flatMap((f) => ("id" in f ? [f.id] : []));
  const owns = (o: BackgroundTable["owner"]) =>
    ("factionId" in o && o.factionId === arch.factionId) ||
    ("speciesId" in o && o.speciesId === speciesId) ||
    ("speciesIds" in o && !!speciesId && o.speciesIds.includes(speciesId)) ||
    ("subFactionId" in o && subFactionIds.includes(o.subFactionId));
  // A Corsair takes the Background of their former faction (rules-flow.md §11.60); an Objectives-only table (Anhrathe)
  // has nothing to choose.
  const from = lookups.factions.get(arch.factionId)?.backgroundsFrom ?? [];
  const tables = [...lookups.backgrounds.values()].filter(
    (t) =>
      (owns(t.owner) || ("factionId" in t.owner && from.includes(t.owner.factionId))) &&
      BACKGROUND_ROWS.some((row) => t[row].length > 0),
  );
  const groups = [...lookups["option-groups"].values()].filter((g) => owns(g.owner));
  const bg = draft.background;
  const table = bg ? lookups.backgrounds.get(bg.tableId) : undefined;
  const onSheet = new Set(r.sheet.abilities.map((a) => a.name)); // traits a Primaris ignores aren't on it
  const bonusOf = (b: Bonus | undefined) => (b ? `+1 ${BONUS_LABELS[b]}` : "its grant");

  // Fills a placeholder with a sub-faction, or a written-in name where the keyword allows one (§11.25).
  const fill = (k: string, v: { id: string } | { writeIn: string } | null) =>
    update((d) => {
      const next = { ...d.fills };
      if (v) next[k] = v;
      else delete next[k];
      return { ...d, fills: next };
    });

  // One Background row by name, or which row's bonus applies.
  const setRow = (row: BackgroundRow, name: string) =>
    update((d) => (d.background ? { ...d, background: { ...d.background, [row]: name } } : d));
  const setBonus = (row: BackgroundRow) =>
    update((d) => (d.background ? { ...d, background: { ...d.background, bonus: row } } : d));

  // Takes an option from a group, or gives it back.
  const toggleOption = (groupId: string, name: string) =>
    update((d) => {
      const list = d.options ?? [];
      const has = list.some((o) => o.groupId === groupId && o.name === name);
      return {
        ...d,
        options: has ? list.filter((o) => !(o.groupId === groupId && o.name === name)) : [...list, { groupId, name }],
      };
    });

  return (
    <div className="stack">
      <div className="rule">KNOW YOUR FACTION</div>
      <div className="dim">
        {titleOf(arch.factionId)} · {lookups.species.get(speciesId ?? "")?.name ?? "no species yet"}
      </div>

      {placeholders.map((k) => {
        const kw = keywordByName.get(k);
        const current = fills[k];
        const options = [...lookups["sub-factions"].values()].filter((s) => s.type === kw?.placeholder);
        return (
          <fieldset key={k} className="panel pad stack">
            <legend className="label">
              {k} {kw && `· ${sourceCite(kw)}`}
            </legend>
            <div className="keys" role="group" aria-label={k}>
              {options.map((s) => {
                const on = !!current && "id" in current && current.id === s.id;
                return (
                  <button
                    key={s.id}
                    className={`btn sm ${on ? "primary" : ""}`}
                    aria-pressed={on}
                    onClick={() => fill(k, on ? null : { id: s.id })}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            {kw?.writeIn && (
              <input
                className="input"
                aria-label={`${k}: write in your own`}
                placeholder="Or write in your own (GM approves)"
                value={current && "writeIn" in current ? current.writeIn : ""}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9' -]/g, "");
                  fill(k, v ? { writeIn: v } : null);
                }}
              />
            )}
            {current && "id" in current && (
              <div className="dim">
                Traits:{" "}
                {lookups["sub-factions"]
                  .get(current.id)
                  ?.traits.map((t) => (onSheet.has(t.name) ? t.name : `${t.name} (ignored: Primaris, Core p.71)`))
                  .join(", ") || `its founding Chapter's (${citeLabel("rules-flow.md §11.23")})`}
              </div>
            )}
          </fieldset>
        );
      })}

      <section className="stack">
        <div className="tbar">
          <span>BACKGROUND</span>
          <span>Core p.30</span>
        </div>
        <div className="keys" role="group" aria-label="Background table">
          {tables.map((t) => (
            <button
              key={t.id}
              className={`btn sm ${bg?.tableId === t.id ? "primary" : ""}`}
              aria-pressed={bg?.tableId === t.id}
              onClick={() => update((d) => ({ ...d, background: { tableId: t.id } }))}
            >
              {t.name} · {sourceCite(t)}
            </button>
          ))}
          {tables.length === 0 && <span className="dim">No Background table for this faction or species.</span>}
        </div>
        {table &&
          BACKGROUND_ROWS.filter((row) => table[row].length > 0).map((row) => (
            <fieldset key={row} className="stack bld-radios">
              <legend className="label">{ROW_LABELS[row]}</legend>
              {table[row].map((o) => (
                <label key={o.name} className="bld-opt">
                  <input
                    type="radio"
                    name={`bg-${row}`}
                    value={o.name}
                    checked={bg?.[row] === o.name}
                    onChange={() => setRow(row, o.name)}
                  />
                  <span>
                    <b>{o.name}</b>
                    {o.bonus && <span className="dim"> · +1 {BONUS_LABELS[o.bonus]}</span>}
                    <span className="dim bld-cite"> {o.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        {table && (
          <fieldset className="panel pad stack bld-radios">
            <legend className="label">WHICH ONE BONUS APPLIES · {citeLabel("rules-flow.md §11.22")}</legend>
            {BACKGROUND_ROWS.filter((row) => bg?.[row]).map((row) => (
              <label key={row} className="bld-opt">
                <input
                  type="radio"
                  name="bg-bonus"
                  value={row}
                  checked={bg?.bonus === row}
                  onChange={() => setBonus(row)}
                />
                <span>
                  {ROW_LABELS[row]}: {bg?.[row]}
                  <span className="dim"> · {bonusOf(table[row].find((o) => o.name === bg?.[row])?.bonus)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.id} className="stack">
          <div className="tbar iron">
            <span>{g.name.toUpperCase()}</span>
            <span>
              {g.pick === "tier" ? "up to your Tier" : g.pick === "any" ? "any number" : `up to ${g.pick}`} ·{" "}
              {sourceCite(g)}
            </span>
          </div>
          <div className="list table">
            {g.options.map((o) => {
              const on = (draft.options ?? []).some((x) => x.groupId === g.id && x.name === o.name);
              return (
                <button key={o.name} className="bld-pick" aria-pressed={on} onClick={() => toggleOption(g.id, o.name)}>
                  <span className="bld-pick-name">
                    {on ? "✓ " : ""}
                    {o.name}
                    {o.notAtCreation && <span className="dim bld-cite"> · not at creation</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <StepChoices step="faction" />
      <div>
        <button className="btn primary" onClick={() => go(arch.tier < tier ? "ascension" : "detail")}>
          NEXT: {arch.tier < tier ? "ASCENSION" : "DETAIL"}
        </button>
      </div>
    </div>
  );
}
