"use client";
import { useState, type ChangeEvent } from "react";

import { results, roll, type Dice } from "@wg/shared";

type TableRollProps = {
  dice: Dice;
  rolled: number | null; // the result shown, from ROLL or I ROLLED
  hits: number; // how many rows it lands on: 0 in a print gap, 2 where the book prints overlapping ranges
  noun: string; // what a row is: "event", "hazard"
  onLand: (result: number) => void;
};

// ROLL ON A BOOK TABLE (issues #39, #49): ROLL (the app rolls on a book table in prep only; a Test stays physical dice,
// rules-flow.md §7), or I ROLLED with what the GM rolled. The caller finds the row(s) and shows them; a new table remounts
// this with a new key, which clears the typed number.
export function TableRoll({ dice, rolled, hits, noun, onLand }: TableRollProps) {
  const [typed, setTyped] = useState("");

  // I ROLLED: only a result these dice can show.
  const handleTyped = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    setTyped(digits);
    if (results(dice).includes(Number(digits))) onLand(Number(digits));
  };

  return (
    <div className="keys" style={{ alignItems: "center" }}>
      <button className="btn sm primary" onClick={() => onLand(roll(dice))}>
        ROLL {dice.toUpperCase()}
      </button>
      <input
        className="input"
        style={{ width: 90 }}
        aria-label={`I rolled (${dice})`}
        placeholder="I ROLLED"
        inputMode="numeric"
        value={typed}
        onChange={handleTyped}
      />
      {rolled !== null && (
        <span>
          <b>ROLLED {rolled}</b>
          {dice === "d66" && (
            <span className="dim">
              {" "}
              (TENS {Math.floor(rolled / 10)} · UNITS {rolled % 10})
            </span>
          )}
          {!hits && (
            <span className="red">
              {" "}
              · the book prints no {noun} for {rolled}
            </span>
          )}
          {hits > 1 && (
            <span className="dim">
              {" "}
              · the book prints two {noun}s for {rolled}: pick one
            </span>
          )}
        </span>
      )}
    </div>
  );
}
