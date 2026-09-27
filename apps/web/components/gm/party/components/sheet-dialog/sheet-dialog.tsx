"use client";
import { useRef, useState } from "react";

import type { Character, LiveState } from "@wg/shared";

import { Sheet } from "@/components/ui/sheet/sheet";
import type { Send } from "@/hooks/use-table/use-table";

type SheetDialogProps = { character: Character; state: LiveState; send: Send };

// SHEET: the Agent's play sheet exactly as its player sees it, pregen or player-made, live from the table state.
// It's the player's own component, so its buttons work for the GM too (the GM may send every action). The sheet
// renders only while open, so a PARTY of ten doesn't draw ten hidden sheets. A native modal <dialog> brings Escape,
// the focus trap, focus return and the backdrop (as Legend does).
export function SheetDialog({ character, state, send }: SheetDialogProps) {
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
        <div className="pl-body">{open && <Sheet me={character} state={state} send={send} />}</div>
      </dialog>
    </>
  );
}
