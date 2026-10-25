"use client";
import { useRef } from "react";

import type { RuleEntry } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

type LegendProps = { title: string; entries: RuleEntry[]; inline?: boolean };

// A (?) that explains every value on a stat block (Core p.323, Bestiary Format) or the player sheet (Traits, Core
// pp.36–38). `inline` draws it as a "(?)" link in a heading instead of the stat block's round button. A native modal
// <dialog> brings Escape, the focus trap, focus return and the backdrop for free.
export function Legend({ title, entries, inline = false }: LegendProps) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={inline ? "rule-link" : "sb-help"}
        aria-label="What do these values mean?"
        onClick={() => ref.current?.showModal()}
      >
        {inline ? "(?)" : "?"}
      </button>
      <dialog
        ref={ref}
        className="legend"
        aria-label={title}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>{title.toUpperCase()}</span>
        </div>
        <div className="list">
          {entries.map((r) => (
            <RuleItem key={r.id} r={r} />
          ))}
        </div>
        <div className="dlg-foot">
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </>
  );
}
