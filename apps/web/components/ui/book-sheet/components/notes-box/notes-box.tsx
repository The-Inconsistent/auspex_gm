"use client";
import { useState } from "react";

import type { Character, CharacterDetail } from "@wg/shared";

import { DetailFields, DetailHelp, DetailView, hasDetail } from "@/components/ui/character-detail/character-detail";
import type { Send } from "@/hooks/use-table/use-table";

import { BookBox } from "../book-box/book-box";
import { FoldRow } from "../fold-row/fold-row";

type NotesBoxProps = { me: Character; send: Send; onError: (error: string | null) => void };

// The book's NOTES box (Core p.41) holds what the player writes, WHO YOU ARE (Core pp.32–36, EDIT and SAVE as the long
// sheet has them), and the GM's ORDERS for this Agent.
export function NotesBox({ me, send, onError }: NotesBoxProps) {
  const [detail, setDetail] = useState<Partial<CharacterDetail> | null>(null); // the text being edited, or null

  // SAVE: writes the detail and closes the editor, or keeps it open with the server's reason.
  const saveDetail = async () => {
    if (!detail) return;
    const r = await send({ type: "character.update", id: me.id, detail });
    onError(r.ok ? null : r.error);
    if (r.ok) setDetail(null);
  };

  const orders = me.objectives.filter((o) => !o.rolled); // the rolled Objective has its own box (ObjectiveBox)

  return (
    <BookBox title="NOTES" id="ps-notes" label="Notes">
      <div className="bs-sub" id="ps-who">
        <span className="bs-lbl">WHO YOU ARE</span>
        <DetailHelp />
        {!detail && (
          <button type="button" className="btn sm" onClick={() => setDetail(me.detail)}>
            {hasDetail(me.detail) ? "EDIT" : "WRITE"}
          </button>
        )}
      </div>
      {detail ? (
        <>
          <DetailFields idPrefix="sheet-detail" value={detail} onChange={setDetail} />
          <div className="keys" style={{ paddingTop: 0 }}>
            <button type="button" className="btn sm primary" onClick={saveDetail}>
              SAVE
            </button>
            <button type="button" className="btn sm" onClick={() => setDetail(null)}>
              CANCEL
            </button>
          </div>
        </>
      ) : hasDetail(me.detail) ? (
        <DetailView detail={me.detail} />
      ) : (
        <div className="ps-ink2">Appearance, past, personality: not written yet.</div>
      )}

      {/* From the GM, to this Agent only (toPlayerView blanks everyone else's). Folded, so a phone left on the table
          doesn't show them to the player beside it. */}
      <div className="bs-sub" id="ps-orders">
        <span className="bs-lbl">ORDERS</span>
      </div>
      {orders.length === 0 && <span className="ps-ink2">No orders from the GM yet.</span>}
      {orders.map((o, i) => (
        <FoldRow
          key={i}
          tag={o.done ? "DONE" : "SECRET"}
          title={
            <span className={o.done ? "ps-struck" : undefined}>
              {o.done ? "Done. Tap to read." : "Hidden from the table. Tap to read."}
            </span>
          }
        >
          <span className={o.done ? "ps-struck" : undefined}>{o.text}</span>
          {o.done && <span className="sr-only"> (done)</span>}
        </FoldRow>
      ))}
    </BookBox>
  );
}
