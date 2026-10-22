"use client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

import type { CounterField } from "@/lib/command/constants";
import { DIRECTIONS, DIRECTION_SIGN, parseDelta, type Direction } from "@/lib/fight-delta/fight-delta";

import { AMOUNTS, DIRECTION_LABEL, PAD_FIELDS } from "../../constants";

type DeltaPadProps = {
  id: string;
  name: string;
  field: CounterField;
  onField: (field: CounterField) => void; // the tracker owns which track is open, so its row and aria-expanded agree
  // What each track has left, as the row shows it ("13/18 LEFT"); null where the row has no such track (Shock "–").
  readout: Record<CounterField, string | null>;
  onApply: (a: { field: CounterField; delta: number }) => void;
  onClose: () => void;
};

// One pad for a row's WOUNDS and SHOCK: which track, DEAL or HEAL, the quick amounts, or a typed signed number.
// Positive = harm taken for both tracks (Wounds and Shock count up), so `-3` heals / recovers 3.
export function DeltaPad({ id, name, field, onField, readout, onApply, onClose }: DeltaPadProps) {
  const [direction, setDirection] = useState<Direction>("deal");
  const [text, setText] = useState("");
  const [refused, setRefused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Focus moves into the pad when it opens (a DOM concern React can't express), so Escape reaches it and a keyboard
  // user lands on it.
  useEffect(() => ref.current?.focus(), []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };

  // Enter on the typed number: a sign wins, a bare number follows DEAL | HEAL.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const delta = parseDelta({ text, direction });
    if (delta === null) return setRefused(true);
    onApply({ field, delta });
  };

  // Typing clears a refusal shown for the last entry.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    setRefused(false);
  };

  return (
    <div
      ref={ref}
      id={id}
      className="fight-pad"
      role="dialog"
      aria-label={`Adjust ${name}`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="fight-pad-top">
        <div className="fight-seg" role="group" aria-label="Which track">
          {PAD_FIELDS.map((f) => (
            <button
              key={f.field}
              type="button"
              aria-pressed={f.field === field}
              disabled={readout[f.field] === null}
              onClick={() => onField(f.field)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="fight-seg" role="group" aria-label="Direction">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button" aria-pressed={d === direction} onClick={() => setDirection(d)}>
              {DIRECTION_LABEL[field][d]}
            </button>
          ))}
        </div>
      </div>
      <div className="fight-pad-body">
        <div className="fight-amounts">
          {AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className="btn"
              onClick={() => onApply({ field, delta: DIRECTION_SIGN[direction] * n })}
            >
              {n}
            </button>
          ))}
        </div>
        <form className="fight-pad-type" onSubmit={handleSubmit}>
          <label className="label" htmlFor={`${id}-text`}>
            or type
          </label>
          <input
            id={`${id}-text`}
            className="input"
            type="text"
            autoComplete="off"
            placeholder="−3 or +2"
            aria-invalid={refused}
            aria-describedby={`${id}-hint`}
            value={text}
            onChange={handleChange}
          />
          <span id={`${id}-hint`} className={refused ? "red" : "dim"} role={refused ? "alert" : undefined}>
            {refused ? "A whole number, 1 to 99." : "Enter applies it."}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            CLOSE
          </button>
        </form>
      </div>
      <div className="label fight-pad-foot">
        APPLIES TO: {name.toUpperCase()} · {PAD_FIELDS.find((f) => f.field === field)?.label} {readout[field]}
      </div>
    </div>
  );
}
