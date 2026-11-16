"use client";
import type { TurnMark } from "@wg/shared";

import type { TurnDo } from "../../types";

type TurnDialogProps = {
  id: string; // the popover's id: the row's turn mark opens it
  name: string;
  mark: TurnMark;
  // READY on the side that isn't up next: which side is, and what SEIZE would cost (null = not allowed).
  nextSide: string | null;
  seizeCost: string | null;
  awareCost: string;
  canAmbush: boolean; // Round 1: a READY row can still be marked ambushed (a latecomer, a forgotten ambush; §11.167)
  onDo: (d: TurnDo) => void;
};

// One small dialog per row holding that row's turn actions (the tracker has no rows of buttons). A native popover, as
// the row's PLAYERS SEE picker: Escape and a tap outside close it, and focus returns to the mark that opened it.
// ponytail: it opens centred, not pinned beside its row; CSS anchor positioning once every table device has it.
export function TurnDialog({ id, name, mark, nextSide, seizeCost, awareCost, canAmbush, onDo }: TurnDialogProps) {
  // Every button closes the popover through the platform, then hands its action up.
  const item = (d: TurnDo, label: string, sub: string, cls = "btn vis-pick") => (
    <button key={d} type="button" className={cls} popoverTarget={id} popoverTargetAction="hide" onClick={() => onDo(d)}>
      <b>{label}</b>
      <span className="dim">{sub}</span>
    </button>
  );
  const ambush = canAmbush && item("ambush", "AMBUSHED", "no Turn in Round 1, AWARE pays to act (p.177)");
  const body = (() => {
    switch (mark) {
      case "ready":
        return nextSide ? (
          <>
            <span className="term-pop-text">
              The {nextSide[0]!.toUpperCase() + nextSide.slice(1)} pick next (Core p.177). Start {name}&rsquo;s Turn
              anyway?
            </span>
            {seizeCost && item("seize", `SEIZE · ${seizeCost}`, "the side that just acted goes again")}
            {item("justGo", "JUST GO", "a fix: free, noted in the chronicle")}
            {item("markDone", "MARK DONE", "a fix: it has had its Turn")}
            {ambush}
          </>
        ) : (
          <>
            {item("start", "START", `${name}'s Turn begins`)}
            {item("markDone", "MARK DONE", "a fix: it has had its Turn")}
            {ambush}
          </>
        );
      case "acting":
        return (
          <>
            {item("end", "END TURN", "ends its Turn; Conditions that tick are listed")}
            {item("hold", "HOLD ACTION", "end the Turn holding the action to interrupt later (p.177)")}
          </>
        );
      case "done":
        return <>{item("notYet", "NOT YET", "another Turn this Round (p.176), or a fix for a slip")}</>;
      case "held":
        return item(
          "interrupt",
          "INTERRUPT",
          "any time this Round; cutting into someone's Turn takes an opposed Initiative Test (pp.177–178, 187)",
        );
      case "ambushed":
        return item("aware", `AWARE · ${awareCost}`, "pays to act normally in Round 1 (p.177)");
      default:
        return null;
    }
  })();
  return (
    <span id={id} popover="auto" className="term-pop" role="dialog" aria-label={`${name}: turn`}>
      <span className="term-pop-head">
        <b className="display">{name.toUpperCase()}</b>
      </span>
      {body}
      <button type="button" className="btn" popoverTarget={id} popoverTargetAction="hide">
        CLOSE
      </button>
    </span>
  );
}
