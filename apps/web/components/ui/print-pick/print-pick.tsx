"use client";
import { Square, SquareCheck } from "lucide-react";

type PrintPickProps = { name: string; on: boolean; onToggle: () => void };

// A row's tick for PRINT N (issue #203), on CODEX › THREATS and ITEMS. It sits in a <summary>, so the tap must not
// also open or close the row.
export function PrintPick({ name, on, onToggle }: PrintPickProps) {
  return (
    <button
      type="button"
      className={`btn sm ${on ? "primary" : ""}`}
      aria-pressed={on}
      aria-label={`Print ${name}`}
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
    >
      {on ? <SquareCheck size={14} /> : <Square size={14} />}
    </button>
  );
}

// Add or drop one id from the picked set.
export const togglePick = (set: ReadonlySet<string>, id: string): ReadonlySet<string> =>
  set.has(id) ? new Set([...set].filter((x) => x !== id)) : new Set([...set, id]);
