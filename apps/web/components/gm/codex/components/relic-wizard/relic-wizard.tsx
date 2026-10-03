"use client";
import { useState } from "react";

import { wargearMatches, type Dice, type RelicCreator, type Wargear } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { Stage } from "../hulk-generator/hulk-generator";
import { Pick } from "../loot-picker/loot-picker";

type RelicWizardProps = {
  creator: RelicCreator;
  wargear: Wargear[];
  tier: number;
  send: Send;
  onError: (error: string | null) => void;
};

type Table<R> = { name: string; page: number; dice: Dice; rows: R[] };
type Picked = Partial<Record<"form" | "owner" | "anointment" | "power" | "oddity" | "enemy", string>>;

// The Holy Relic creator (RR2 pp.12–19, issue #51 step 8): Form, Origins, Power and Oddity, each rolled, typed in or
// picked, then the catalogue entry the Form becomes. MAKE RELIC writes one item, its rolls in GM NOTES; a Power applies
// to the profile only where it can (rules-flow.md §11.116).
export function RelicWizard({ creator: c, wargear, tier, send, onError }: RelicWizardProps) {
  const [picked, setPicked] = useState<Picked>({});
  const [entryId, setEntryId] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const form = c.form.rows.find((r) => r.id === picked.form);
  const powers = form && c.powers.find((p) => p.kind === form.kind);
  const power = powers?.rows.find((r) => r.id === picked.power);
  const ready = form && entryId && picked.owner && picked.anointment && power && picked.oddity;

  // A new Form starts the Power and the catalogue entry over: they depend on its kind.
  const pick = (key: keyof Picked, id: string) => {
    setDone(null);
    setPicked(key === "form" ? { ...picked, form: id, power: undefined, enemy: undefined } : { ...picked, [key]: id });
    if (key === "form") setEntryId("");
  };
  const stage = <R extends { id: string; name: string; text?: string }>(
    key: keyof Picked,
    label: string,
    t: Table<R>,
  ) => {
    const row = t.rows.find((r) => r.id === picked[key]);
    return (
      <>
        <Stage
          label={label}
          table={{ ...t, id: `relic-${key}-${t.name}` }}
          noun="row"
          picked={row ? [row] : []}
          onPick={(r) => pick(key, r.id)}
        />
        {row && <b>{row.name.toUpperCase()}</b>}
        {row?.text && <pre className="text dim">{row.text}</pre>}
      </>
    );
  };
  // MAKE RELIC: the server reads the rows and writes the item.
  const make = async () => {
    if (!ready) return;
    const r = await send({
      type: "codex.addRelic",
      name: name.trim() || undefined,
      form: form.id,
      wargearId: entryId,
      owner: picked.owner!,
      anointment: picked.anointment!,
      power: power.id,
      oddity: picked.oddity!,
      enemy: power.enemy ? picked.enemy : undefined,
    });
    onError(r.ok ? null : r.error);
    if (r.ok) setDone("RELIC MADE: see the list below");
  };

  return (
    <details className="panel pad">
      <summary className="label" style={{ cursor: "pointer" }}>
        HOLY RELIC CREATOR (RR2 pp.12–19)
      </summary>
      <div className="stack" style={{ gap: 10, paddingTop: 8 }}>
        {stage("form", "1 · FORM", c.form)}
        {form && (
          <Pick
            key={form.id}
            item={{ count: 1, mods: [] }}
            matches={wargear.filter((w) => wargearMatches(w, form.pick, { tier, newTier: tier }))}
            value={entryId}
            onChange={setEntryId}
          />
        )}
        {stage("owner", "2 · ORIGINAL OWNER", c.owners)}
        {stage("anointment", "2 · ANOINTMENT", c.anointments)}
        {powers ? stage("power", "3 · POWER", powers) : <span className="dim">3 · POWER: pick a Form first.</span>}
        {power?.enemy && stage("enemy", "3 · ENEMY", c.enemies)}
        {stage("oddity", "4 · ODDITY", c.oddities)}
        <div className="field">
          <label className="label" htmlFor="relic-name">
            5 · NAME (optional)
          </label>
          <input
            id="relic-name"
            className="input"
            value={name}
            maxLength={200}
            placeholder="Relic …"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn primary" disabled={!ready} onClick={make}>
          MAKE RELIC
        </button>
        {done && <div className="accent">{done}</div>}
      </div>
    </details>
  );
}
