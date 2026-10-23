"use client";
import { useId, type ReactNode } from "react";

import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { SHEET_TERMS, type SheetTermKey } from "@/lib/sheet-terms/sheet-terms";

type TermProps = { k: SheetTermKey; children?: ReactNode };

// A sheet word a new player can tap for what it means: our one-line meaning and its page (lib/sheet-terms), shown to
// anyone, and FULL RULE when this seat is served that rule (the JOIN page has none: book text needs a seat). A native
// popover: light dismiss, Escape, no state.
export function Term({ k, children }: TermProps) {
  const t: (typeof SHEET_TERMS)[SheetTermKey] = SHEET_TERMS[k];
  const id = useId();
  const { get, open } = useRules();
  const rule = "rule" in t ? get(t.rule) : undefined;

  // FULL RULE: close the meaning, then open the rule's own dialog.
  const handleFull = () => {
    document.getElementById(id)?.hidePopover();
    if (rule) open([rule]);
  };

  return (
    <>
      {/* What it shows stays its name for a screen reader (a Trait cell keeps its number); the hint is added to it. */}
      <button type="button" className="term" popoverTarget={id}>
        {children ?? t.name}
        <span className="sr-only"> ({t.name}: what it means)</span>
      </button>
      <span id={id} popover="auto" className="term-pop" role="dialog" aria-label={t.name}>
        <span className="term-pop-head">
          <b className="display">{t.name}</b>
          <i>{t.cite}</i>
        </span>
        <span className="term-pop-text">{t.meaning}</span>
        <span className="term-pop-keys">
          {rule && (
            <button type="button" className="btn sm" onClick={handleFull}>
              FULL RULE
            </button>
          )}
          {/* A tap outside also closes it, but a phone needs a button to see. */}
          <button type="button" className="btn sm" popoverTarget={id} popoverTargetAction="hide">
            CLOSE
          </button>
        </span>
      </span>
    </>
  );
}
