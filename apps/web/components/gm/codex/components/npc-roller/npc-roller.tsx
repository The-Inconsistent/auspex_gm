"use client";
import { useState } from "react";

import {
  LOOK,
  LOOK_TABLE_IDS,
  isNameTable,
  rollLook,
  rollOn,
  sourceCite,
  type FlavourTable,
  type LookSpecies,
} from "@wg/shared";

type NpcRollerProps = {
  id: string;
  tables: FlavourTable[];
  onName: (name: string) => void;
  onLook: (line: string) => void;
};

const SPECIES = Object.keys(LOOK) as LookSpecies[];

// ROLL NAME and ROLL LOOK (issue #48): the books' name and appearance tables, rolled in prep only; a Test stays physical (rules-flow §7). Each
// fills an editable field and sends nothing; the editor's SAVE does. No I ROLLED: name lists have no dice, and the GM
// types a physical roll into the field (rules-flow §11.91).
export function NpcRoller({ id, tables, onName, onLook }: NpcRollerProps) {
  const names = tables.filter(isNameTable);
  const [tableId, setTableId] = useState(names[0]?.id ?? "");
  const [species, setSpecies] = useState<LookSpecies>("human");
  const [dice, setDice] = useState<string | null>(null);

  const canLook = LOOK_TABLE_IDS.every((id) => tables.some((t) => t.id === id));

  // ROLL NAME: one roll on the picked list into NAME, replacing what's there.
  const handleName = () => {
    const t = names.find((n) => n.id === tableId);
    if (!t) return;
    onName(rollOn(t).cells.join(" "));
    setDice(null);
  };
  // ROLL LOOK: hair, eyes and a Feature for the picked species onto DESCRIPTION, with the dice shown.
  const handleLook = () => {
    const r = rollLook({ tables, species });
    if (!r) return;
    onLook(r.line);
    setDice(r.dice.join(" · "));
  };

  return (
    <div className="stack" role="group" aria-labelledby={id} style={{ gap: 8 }}>
      <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
        <select
          className="input"
          aria-label="Name table"
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          style={{ flex: "1 1 220px", width: "auto" }}
        >
          {names.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {sourceCite(t)}
            </option>
          ))}
        </select>
        <button className="btn sm primary" onClick={handleName} disabled={!names.length}>
          ROLL NAME
        </button>
      </div>
      <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
        {SPECIES.map((s) => (
          <button
            key={s}
            className={`btn sm ${species === s ? "primary" : ""}`}
            aria-pressed={species === s}
            onClick={() => setSpecies(s)}
          >
            {LOOK[s].label}
          </button>
        ))}
        <button className="btn sm primary" onClick={handleLook} disabled={!canLook} style={{ marginLeft: "auto" }}>
          ROLL LOOK
        </button>
      </div>
      {dice && <span className="dim">{dice}</span>}
    </div>
  );
}
