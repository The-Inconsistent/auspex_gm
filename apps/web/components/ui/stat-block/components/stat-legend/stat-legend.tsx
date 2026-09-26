"use client";
import { useRef } from "react";

import type { RuleEntry } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

type StatLegendProps = { entries: RuleEntry[] };

// The (?) on a stat block: what each printed value means (Core p.323, Bestiary Format). A native modal <dialog>
// brings Escape, the focus trap, focus return and the backdrop for free.
export function StatLegend({ entries }: StatLegendProps) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="sb-help" aria-label="What do these values mean?" onClick={() => ref.current?.showModal()}>
        ?
      </button>
      <dialog
        ref={ref}
        className="legend"
        aria-label="Reading a stat block"
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>READING A STAT BLOCK</span>
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
        <div className="list">
          {entries.map((r) => (
            <RuleItem key={r.id} r={r} />
          ))}
        </div>
      </dialog>
    </>
  );
}
