"use client";
import { useRef, useState } from "react";

import { Sheet, type SheetProps } from "@/components/ui/sheet/sheet";

// SHEET: the Agent's whole sheet on one page, pregen or player-made (the player's phone has its own two views,
// components/player/player-sheet). With `table` (GM PARTY) it's
// live and its buttons work for the GM too (the GM may send every action); without it, read-only. (The invite page
// shows its own Agent cards, components/invite/invite-accept/components/agent-card.)
// The sheet renders only while open, so a PARTY of ten doesn't draw ten hidden sheets. A native modal <dialog> brings
// Escape, the focus trap, focus return and the backdrop (as Legend does).
export function SheetDialog(props: SheetProps) {
  const character = props.me;
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };

  return (
    <>
      <button className="btn sm" onClick={show}>
        SHEET
      </button>
      <dialog
        ref={ref}
        className="sheet"
        aria-label={`${character.name}: character sheet`}
        onClose={() => setOpen(false)}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>{character.name.toUpperCase()}</span>
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
        <div className="pl-body">{open && <Sheet {...props} />}</div>
      </dialog>
    </>
  );
}
