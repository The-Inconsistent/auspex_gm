"use client";
import { useRef, useState } from "react";

import type { Character, LiveState } from "@wg/shared";

import { fromCharacter } from "@/lib/sheet-input/sheet-input";
import { BookSheet } from "@/components/ui/book-sheet/book-sheet";
import { Refusal } from "@/components/ui/refusal/refusal";
import { SheetExport } from "@/components/ui/sheet-export/sheet-export";
import type { Send } from "@/hooks/use-table/use-table";

type SheetDialogProps = { me: Character; tier: number; table: { state: LiveState; send: Send } };

// SHEET (GM PARTY): the Agent as the book's character sheet, the same one the player's DOSSIER draws (ui/book-sheet),
// live, its buttons working for the GM too (the GM may send every action); the GM spends Wrath from PARTY, so there is
// no SPEND WRATH to ask with. The sheet renders only while open, so a PARTY of ten doesn't draw ten hidden sheets. A
// native modal <dialog> brings Escape, the focus trap, focus return and the backdrop (as Legend does).
export function SheetDialog({ me, tier, table }: SheetDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        aria-label={`${me.name}: character sheet`}
        // only its own close: a dialog inside the sheet (WHO YOU ARE's help) must not unmount it
        onClose={(e) => e.target === e.currentTarget && setOpen(false)}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>{me.name.toUpperCase()}</span>
        </div>
        <div className="pl-body">
          {open && <BookSheet me={me} tier={tier} table={{ ...table, onError: setError }} />}
        </div>
        <Refusal error={error} onDismiss={() => setError(null)} />
        <div className="dlg-foot">
          {open && <SheetExport toSheet={() => fromCharacter(me, tier)} />}
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </>
  );
}
