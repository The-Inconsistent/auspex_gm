"use client";
import { X } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { isMeleeWeapon, sourceCite, thrownMetres, threatWeapon, withTypedRange, type Wargear } from "@wg/shared";

import { FindField } from "@/components/ui/find-field/find-field";
import { DragHandle, moveItem, useReorder } from "@/hooks/use-reorder/use-reorder";
import { weaponLine } from "@/lib/weapon-line/weapon-line";

import {
  apText,
  damageText,
  edText,
  parseAp,
  parseDamage,
  parseEd,
  parseRange,
  parseSalvo,
  rangeText,
  salvoText,
  type DraftWeapon,
  type Parsed,
} from "./utils";

type CellProps<T> = {
  label: string;
  value: T;
  show: (v: T) => string;
  parse: (s: string) => Parsed<T>;
  onCommit: (v: T) => void;
};

// One profile number as typed: it commits each value that reads, and keeps text that doesn't yet (a half-typed "12 /"),
// marked, until it does or the GM leaves the cell and it shows the last good value again.
function Cell<T>({ label, value, show, parse, onCommit }: CellProps<T>) {
  const [text, setText] = useState<string | null>(null);
  const bad = text !== null && parse(text) === null;

  // Keep the text as typed, and commit it as soon as it reads.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    const p = parse(e.target.value);
    if (p) onCommit(p.value);
  };

  return (
    <input
      className="th-cell-in"
      aria-label={label}
      aria-invalid={bad || undefined}
      value={text ?? show(value)}
      onChange={handleChange}
      onBlur={() => setText(null)}
    />
  );
}

type WeaponTableProps = {
  label: string; // whose weapons: "Ability 1", for the screen reader's names
  weapons: DraftWeapon[];
  strength: number; // the threat's S: a catalogue melee "(S) + X" resolves against it (Core pp.211-213)
  wargear: Wargear[];
  onChange: (weapons: DraftWeapon[]) => void;
};

// The weapons under an ability as the book's columns (canvas Threat-Weapons): every number can be written, a catalogue
// pick fills a row that stays editable, and a name the catalogue doesn't hold starts a blank row.
export function WeaponTable({ label, weapons, strength, wargear, onChange }: WeaponTableProps) {
  const put = (i: number, next: DraftWeapon) => onChange(weapons.map((w, j) => (j === i ? next : w)));
  const set = (i: number, patch: Partial<DraftWeapon>) => put(i, { ...weapons[i]!, ...patch });
  const { rowRef, handle } = useReorder({
    count: weapons.length,
    onMove: (from, to) => onChange(moveItem(weapons, from, to)),
  });
  const [traitText, setTraitText] = useState<Record<number, string>>({});

  // The catalogue's weapons, each shown as it would print for this threat.
  const catalogue = useMemo(() => wargear.filter((w) => w.weapon), [wargear]);
  const options = useMemo(
    () =>
      catalogue.map((w) => ({
        id: w.id,
        name: w.name,
        detail: `${weaponLine({ weapon: threatWeapon({ name: w.name, weapon: w.weapon! }, strength) })} · ${sourceCite(w)}`,
      })),
    [catalogue, strength],
  );
  const add = (id: string) => {
    const entry = catalogue.find((w) => w.id === id);
    if (entry) onChange([...weapons, threatWeapon({ name: entry.name, weapon: entry.weapon! }, strength)]);
  };

  // Enter or a comma takes the typed trait; the line can hold several at once ("Brutal, Rending (2)").
  const addTraits = (i: number) => {
    const typed = (traitText[i] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (typed.length) set(i, { traits: [...(weapons[i]?.traits ?? []), ...typed] });
    setTraitText((t) => ({ ...t, [i]: "" }));
  };
  const handleTraitKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTraits(i);
    }
  };

  return (
    <div className="th-weapons">
      {weapons.length > 0 && (
        <div className="th-wt" role="table" aria-label={`${label}: weapons`}>
          <div className="th-wrow th-whead" role="row">
            <span role="columnheader" aria-label="Order" />
            <span role="columnheader">WEAPON</span>
            <span role="columnheader">DMG</span>
            <span role="columnheader">ED</span>
            <span role="columnheader">AP</span>
            <span role="columnheader">RANGE</span>
            <span role="columnheader">SALVO</span>
            <span role="columnheader" aria-label="Remove" />
          </div>
          {weapons.map((w, i) => {
            const name = w.name || `weapon ${i + 1}`;
            const traits = w.traits ?? [];
            return (
              <div key={i} ref={rowRef(i)} className="th-wbody" role="rowgroup">
                <div className="th-wrow" role="row">
                  <DragHandle label={name} {...handle(i)} />
                  <input
                    className="th-cell-in th-wname"
                    aria-label={`${label}, weapon ${i + 1}: name`}
                    value={w.name}
                    onChange={(e) => set(i, { name: e.target.value })}
                  />
                  <Cell
                    label={`${name}: damage`}
                    value={w.damage}
                    show={damageText}
                    parse={parseDamage}
                    onCommit={(damage) => set(i, { damage })}
                  />
                  <Cell
                    label={`${name}: extra damage dice`}
                    value={w.ed}
                    show={edText}
                    parse={parseEd}
                    onCommit={(ed) => set(i, { ed })}
                  />
                  <Cell
                    label={`${name}: AP`}
                    value={w.ap}
                    show={apText}
                    parse={parseAp}
                    onCommit={(ap) => set(i, { ap })}
                  />
                  <Cell
                    label={`${name}: range, MELEE or up to three numbers`}
                    value={w.range}
                    show={rangeText}
                    parse={parseRange}
                    // A typed range is the GM's own number, and may end the weapon's link to Strength (§11.165).
                    onCommit={(range) => put(i, withTypedRange(w, range))}
                  />
                  <Cell
                    label={`${name}: salvo, a number or –`}
                    value={w.salvo}
                    show={salvoText}
                    parse={parseSalvo}
                    onCommit={(salvo) => set(i, { salvo })}
                  />
                  <button
                    type="button"
                    className="th-wdel"
                    aria-label={`Remove ${name}`}
                    onClick={() => onChange(weapons.filter((_, j) => j !== i))}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="th-wline">
                  <span className="label">TRAITS</span>
                  {traits.map((t, ti) => (
                    <span key={ti} className="th-trait">
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove ${t} from ${name}`}
                        onClick={() => set(i, { traits: traits.filter((_, j) => j !== ti) })}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  <input
                    className="th-trait-in"
                    aria-label={`Add a trait to ${name}`}
                    placeholder="+ trait"
                    value={traitText[i] ?? ""}
                    onChange={(e) => setTraitText((t) => ({ ...t, [i]: e.target.value }))}
                    onKeyDown={handleTraitKey(i)}
                    onBlur={() => addTraits(i)}
                  />
                  {w.thrown !== undefined && (
                    <span className="dim">
                      Thrown S × {w.thrown} = {thrownMetres(strength, w.thrown)} m
                    </span>
                  )}
                  {/* Not every melee weapon adds Strength (a Voidblade doesn't), so the GM says which do (§11.165). */}
                  {isMeleeWeapon(w) && (
                    <label className="th-counts">
                      <input
                        type="checkbox"
                        checked={!!w.countsStrength}
                        onChange={(e) => set(i, { countsStrength: e.target.checked ? true : undefined })}
                      />
                      Damage counts Strength ({strength})
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <FindField
        label="Weapon: find one in the Wargear catalogue, or name your own"
        options={options}
        onPick={add}
        newLabel={(q) => `+ WRITE MY OWN “${q}”`}
        onCreate={(q) => onChange([...weapons, { name: q, damage: 1, ed: 1, range: [1], traits: [] }])}
      />
    </div>
  );
}
