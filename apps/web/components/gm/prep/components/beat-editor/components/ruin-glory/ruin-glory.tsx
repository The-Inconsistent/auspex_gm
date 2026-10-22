"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import {
  MAX_POOL_LINES,
  MAX_POOL_STEP,
  presetLine,
  threatCite,
  type Pool,
  type PoolPreset,
  type PoolPresetTable,
} from "@wg/shared";

import { FindField } from "@/components/ui/find-field/find-field";
import { NumberInput } from "@/components/ui/number-input/number-input";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import { DragHandle, moveItem, useReorder } from "@/hooks/use-reorder/use-reorder";

import type { PoolDrafts } from "../../../../types";
import { SPEND_POOLS } from "./constants";

type RuinGloryProps = { lines: PoolDrafts; tables: PoolPresetTable[]; onChange: (lines: PoolDrafts) => void };

// What a preset is worth, as its chip reads: "+1 RUIN" earned, "RUIN 1" spent, "RUIN · YOU SET" where the book prints
// no number.
const worth = ({ kind, pool, n }: PoolPreset) =>
  n === null
    ? `${pool.toUpperCase()} · YOU SET`
    : kind === "earn"
      ? `+${n} ${pool.toUpperCase()}`
      : `${pool.toUpperCase()} ${n}`;

// presetLine ends a line's text with its cite in brackets; that cite is all a spend row shows of where it came from.
const citeOf = (text: string) => /\(([^()]*\bp\.\d+)\)\s*$/.exec(text)?.[1];

// What earns Ruin and Glory in this scene, and the spends the GM plans (issue #40). SCENE turns each line into a tap.
// Lines are found in the books or written; a cleared line is dropped on save (Flow-EditorPools).
export function RuinGlory({ lines, tables, onChange }: RuinGloryProps) {
  const [open, setOpen] = useState<number | null>(null); // the spend whose fields are showing, one at a time
  const setLine = (list: Pool, i: number, patch: Partial<PoolDrafts[Pool][number]>) =>
    onChange({ ...lines, [list]: lines[list].map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setSpend = (i: number, patch: Partial<PoolDrafts["spends"][number]>) =>
    onChange({ ...lines, spends: lines.spends.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  // The drag moves one place at a time, so an open row follows the swap it is part of.
  const { rowRef, handle } = useReorder({
    count: lines.spends.length,
    onMove: (from, to) => {
      onChange({ ...lines, spends: moveItem(lines.spends, from, to) });
      setOpen((o) => (o === from ? to : o === to ? from : o));
    },
  });

  // Every printed row the finder can offer: its table travels with it so presetLine can cite the page.
  const book = tables.flatMap((table) => table.rows.map((row, i) => ({ table, row, id: `${table.id}:${i}` })));
  const option = ({ table, row, id }: (typeof book)[number]) => ({
    id,
    name: row.name,
    detail: threatCite({ source: table.source, page: row.page ?? table.page }),
    chip: <span className={`chip ${row.pool === "ruin" ? "warn" : ""}`}>{worth(row)}</span>,
  });

  // Picking copies the row into the scene with its cite; a spend opens, since a cost the book leaves out waits for you.
  const pick = (id: string) => {
    const found = book.find((b) => b.id === id);
    if (!found) return;
    const added = presetLine({ table: found.table, row: found.row });
    if (added.list === "spends") {
      onChange({ ...lines, spends: [...lines.spends, added.line] });
      setOpen(lines.spends.length);
    } else onChange({ ...lines, [added.list]: [...lines[added.list], added.line] });
  };

  const earned = (list: Pool, label: string, hint: string) => (
    <div className="field">
      <span className="label">
        {label} ·{" "}
        <RuleIdLink id={`character-${list}`}>
          <span className={`chip ${list === "ruin" ? "warn" : ""}`}>{list.toUpperCase()}</span>
        </RuleIdLink>
      </span>
      {lines[list].map((l, i) => (
        <div key={i} className="rg-line">
          <span className={`rg-amt ${list}`}>
            <span aria-hidden="true">+</span>
            <NumberInput
              value={l.amount}
              label={`${list} line ${i + 1}, amount`}
              max={MAX_POOL_STEP}
              onChange={(amount) => setLine(list, i, { amount })}
            />
          </span>
          <input
            className="input"
            aria-label={`${list} line ${i + 1}`}
            placeholder={list === "ruin" ? "Each failed Survival Test" : "They disarm it without raising the alarm"}
            maxLength={200}
            value={l.text}
            onChange={(e) => setLine(list, i, { text: e.target.value })}
          />
        </div>
      ))}
      {lines[list].length < MAX_POOL_LINES && (
        <FindField
          label="Find in the books or write one"
          options={book.filter((b) => b.row.kind === "earn" && b.row.pool === list).map(option)}
          onPick={pick}
          newLabel={(typed) => `+ NEW LINE “${typed}”`}
          onCreate={(text) => onChange({ ...lines, [list]: [...lines[list], { text, amount: 1 }] })}
        />
      )}
      <span className="dim" style={{ fontSize: 12 }}>
        {hint}
      </span>
    </div>
  );

  const usage = tables.filter((t) => t.gm);

  return (
    <>
      {earned(
        "ruin",
        "RUIN · WHAT EARNS IT HERE",
        "Always +1, in any scene: a player fails a Corruption or Fear Test, or you roll a 6 on the Wrath Die (Core Rulebook p.320).",
      )}
      {earned(
        "glory",
        "GLORY · AWARDS",
        "For particularly impressive feats (Core Rulebook p.316). The book prints no amount: you set it.",
      )}
      <div className="field">
        <span className="label">SPENDS · PLANNED</span>
        <div className="ed-rows">
          {lines.spends.map((s, i) => {
            const isOpen = open === i;
            const cite = citeOf(s.text);
            const label = s.name || `spend ${i + 1}`;
            return (
              <div key={i} ref={rowRef(i)} className={`ed-row ${isOpen ? "open" : ""}`}>
                <div className="ed-row-head">
                  <DragHandle label={label} {...handle(i)} />
                  <button
                    type="button"
                    className="ed-sum"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <b className={s.pool === "ruin" ? "red" : ""}>
                      {s.pool.toUpperCase()} {s.cost ?? <span className="red">—</span>}
                    </b>
                    <span>{s.name || <span className="dim">Unnamed</span>}</span>
                    {cite && <span className="dim">· {cite}</span>}
                    {s.cost === null && <span className="chip warn">SET THE COST</span>}
                    <span style={{ marginLeft: "auto" }}>
                      {isOpen ? (
                        <ChevronUp size={16} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={16} aria-hidden="true" />
                      )}
                    </span>
                  </button>
                </div>
                {isOpen && (
                  <div className="ed-row-body">
                    <div className="keys" style={{ alignItems: "flex-end" }}>
                      <div className="field">
                        <span className="label">POOL</span>
                        <div className="seg" role="group" aria-label={`Spend ${i + 1} pool`}>
                          {SPEND_POOLS.map((p) => (
                            <button
                              key={p}
                              className={`btn sm ${s.pool === p ? "primary" : ""}`}
                              aria-pressed={s.pool === p}
                              onClick={() => setSpend(i, { pool: p })}
                            >
                              {p.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <span className="label">COST</span>
                        <NumberInput
                          value={s.cost}
                          label={`Spend ${i + 1}, cost`}
                          max={MAX_POOL_STEP}
                          onChange={(cost) => setSpend(i, { cost })}
                        />
                      </div>
                      <div className="field" style={{ flex: "1 1 200px" }}>
                        <span className="label">NAME</span>
                        <input
                          className="input"
                          aria-label={`Spend ${i + 1} name`}
                          maxLength={100}
                          value={s.name}
                          onChange={(e) => setSpend(i, { name: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <span className="label">WHAT IT DOES</span>
                      <textarea
                        className="input"
                        aria-label={`Spend ${i + 1} effect`}
                        rows={3}
                        maxLength={500}
                        value={s.text}
                        onChange={(e) => setSpend(i, { text: e.target.value })}
                      />
                    </div>
                    <div className="keys" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <button
                        type="button"
                        className="lnk red"
                        onClick={() => {
                          onChange({ ...lines, spends: lines.spends.filter((_, j) => j !== i) });
                          setOpen(null);
                        }}
                      >
                        REMOVE
                      </button>
                      {cite && <i className="dim">{cite}</i>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {lines.spends.length < MAX_POOL_LINES && (
          <FindField
            label="Find a spend in the books or name one"
            options={book.filter((b) => b.row.kind === "spend").map(option)}
            onPick={pick}
            newLabel={(typed) => `+ NEW SPEND “${typed}”`}
            onCreate={(name) => {
              onChange({ ...lines, spends: [...lines.spends, { pool: "ruin", name, cost: 1, text: "" }] });
              setOpen(lines.spends.length);
            }}
          />
        )}
        <span className="dim" style={{ fontSize: 12 }}>
          Spend Ruin to escalate the scene, never to punish anyone (Core Rulebook p.320).
        </span>
      </div>
      {usage.length > 0 && (
        <details className="field plate">
          <summary className="label">HOW TO USE THE BOOKS’ LISTS</summary>
          {usage.map((t) => (
            <div key={t.id} className="stack" style={{ gap: 4, paddingTop: 6 }}>
              <b>
                {t.name} · {threatCite({ source: t.source, page: t.page })}
              </b>
              <pre className="text">{t.gm}</pre>
            </div>
          ))}
        </details>
      )}
      <span className="dim" style={{ fontSize: 12 }}>
        Clear a line to drop it when you save.
      </span>
    </>
  );
}
