"use client";
import { Lock } from "lucide-react";
import { useId } from "react";

// A private handout's reach: "🔒 NAMES ONLY", shortened to fit the row. Names that share a rank ("BROTHER …") differ
// only at the end, so a tap opens the full list in the same card a sheet term uses (ui/term). A native popover: light
// dismiss, Escape, no state; a tablet has no hover for a title.
export function ReachChip({ only }: { only: string }) {
  const id = useId();
  return (
    <>
      <button type="button" className="chip warn reach" popoverTarget={id} aria-label={`${only} only: show the names`}>
        <Lock size={12} strokeWidth={2.4} aria-hidden="true" />
        <span className="reach-names">{only}</span>&nbsp;ONLY
      </button>
      <span id={id} popover="auto" className="term-pop" role="dialog" aria-label="Reveal to">
        <span className="term-pop-head">
          <b className="display">REVEAL TO</b>
        </span>
        <span className="term-pop-text">{only}</span>
        <span className="term-pop-keys">
          <button type="button" className="btn sm" popoverTarget={id} popoverTargetAction="hide">
            CLOSE
          </button>
        </span>
      </span>
    </>
  );
}
