"use client";
import { useId, type ReactNode } from "react";

import type { RuleEntry } from "@wg/shared";

import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { SHEET_TERMS, type SheetTermKey } from "@/lib/sheet-terms/sheet-terms";

type PopProps = {
  title: string;
  cite: string;
  body: ReactNode;
  rule?: RuleEntry; // FULL RULE opens it, when this seat is served it
  children: ReactNode; // what the button shows
};

// A word on a sheet a new player can tap: a card with its title, page and body, CLOSE, and FULL RULE when there's a
// rule to open. A native popover: light dismiss, Escape, no state.
export function Pop({ title, cite, body, rule, children }: PopProps) {
  const id = useId();
  const { open } = useRules();

  // FULL RULE: close the card, then open the rule's own dialog.
  const handleFull = () => {
    document.getElementById(id)?.hidePopover();
    if (rule) open([rule]);
  };

  return (
    <>
      {/* What it shows stays its name for a screen reader (a Trait cell keeps its number); the hint is added to it. */}
      <button type="button" className="term" popoverTarget={id}>
        {children}
        <span className="sr-only"> ({title}: what it means)</span>
      </button>
      <span id={id} popover="auto" className="term-pop" role="dialog" aria-label={title}>
        <span className="term-pop-head">
          <b className="display">{title}</b>
          <i>{cite}</i>
        </span>
        <span className="term-pop-text">{body}</span>
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

type TermProps = { k: SheetTermKey; children?: ReactNode };

// A sheet term: our one-line meaning and its page (lib/sheet-terms), shown to anyone, and FULL RULE when this seat is
// served that rule (the JOIN page has none: book text needs a seat).
export function Term({ k, children }: TermProps) {
  const t: (typeof SHEET_TERMS)[SheetTermKey] = SHEET_TERMS[k];
  const { get } = useRules();
  return (
    <Pop title={t.name} cite={t.cite} body={t.meaning} rule={"rule" in t ? get(t.rule) : undefined}>
      {children ?? t.name}
    </Pop>
  );
}
