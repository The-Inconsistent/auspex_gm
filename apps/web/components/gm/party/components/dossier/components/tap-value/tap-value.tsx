"use client";
import { useState, type ChangeEvent, type FormEvent } from "react";

import type { ActionResult, Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { parseDelta } from "@/lib/fight-delta/fight-delta";
import { PAD_FIELDS, PAD_STEPS, padAction, type PadField } from "@/lib/party-view/party-view";

type TapValueProps = {
  field: PadField;
  character: Character;
  shown: string; // the value as the GM reads it, e.g. "5/18"
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// A value the GM taps rather than steps: the button shows the number, and a tap opens a small pad under it with −1,
// +1 and a signed number to type ("+3", "-2"). Each press sends the same action the old ±1 buttons did, as a delta, so
// two tablets never overwrite each other. The pad stays open for repeat taps until DONE.
export function TapValue({ field, character: c, shown, send, onResult }: TapValueProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState(false); // the typed number was refused
  const label = PAD_FIELDS[field];
  const [down, up] = PAD_STEPS[field];

  // −1, +1 or the typed number.
  const apply = async (delta: number) => {
    onResult(
      await send(padAction({ field, id: c.id, delta })),
      `${c.name.toUpperCase()} ${label} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`,
    );
  };

  // The typed number, on Enter or APPLY: a number the pad can't read shows its hint and sends nothing.
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const delta = parseDelta({ text, direction: "deal" }); // a bare number adds
    setHint(delta === null);
    if (delta === null) return;
    await apply(delta);
    setText("");
  };

  // Typing clears a refusal shown for the last entry.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    setHint(false);
  };

  return (
    <div className="party-tap">
      <button
        className="btn party-tap-btn"
        aria-expanded={open}
        aria-label={`${label} ${shown}, adjust`}
        onClick={() => setOpen(!open)}
      >
        <span className="label">{label}</span>
        <span className="party-num">{shown}</span>
      </button>
      {open && (
        <form className="party-pad" onSubmit={handleSubmit} aria-label={`Adjust ${label}`}>
          <button type="button" className="btn" aria-label={`${down} ${label}`} onClick={() => apply(-1)}>
            {down}
          </button>
          <button type="button" className="btn" aria-label={`${up} ${label}`} onClick={() => apply(1)}>
            {up}
          </button>
          <input
            className="input"
            style={{ width: 96 }}
            inputMode="text"
            aria-label={`${label}: signed number`}
            aria-invalid={hint}
            placeholder="+3 / −2"
            value={text}
            onChange={handleChange}
          />
          <button className="btn primary">APPLY</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            DONE
          </button>
          {hint && <span className="red">A whole number from 1 to 99, signed: +3 or −2.</span>}
        </form>
      )}
    </div>
  );
}
