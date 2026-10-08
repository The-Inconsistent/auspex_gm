"use client";
import { Square, SquareCheck } from "lucide-react";
import type { MouseEvent } from "react";

type PrintPickProps = { name: string; on: boolean; onToggle: () => void };

// A row's tick for PRINT N (issue #203), on CODEX › THREATS and ITEMS.
export function PrintPick({ name, on, onToggle }: PrintPickProps) {
  // It sits in a <summary>, so the tap must not also open or close the row.
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    onToggle();
  };

  return (
    <button
      type="button"
      className={`btn sm ${on ? "primary" : ""}`}
      aria-pressed={on}
      aria-label={`Print ${name}`}
      onClick={handleClick}
    >
      {on ? <SquareCheck size={14} /> : <Square size={14} />}
    </button>
  );
}
