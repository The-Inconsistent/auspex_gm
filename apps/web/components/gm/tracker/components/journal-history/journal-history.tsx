"use client";
import { useState } from "react";

import type { JournalItem } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type JournalHistoryProps = {
  // The api pushes these over the socket after every journaled action (newest first); nothing is fetched here.
  items: JournalItem[];
  send: Send;
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// HISTORY: the server's journal of this campaign, newest first. UNDO on a standing entry, REDO on an undo entry
// (undoing an undo). A refusal ("Undo … first.") shows inline.
export function JournalHistory({ items, send }: JournalHistoryProps) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // UNDO / REDO: asks the server to revert the entry; a refusal ("Undo … first.") shows inline.
  const handleUndo = async (item: JournalItem) => {
    const r = await send({ type: "journal.undo", entryId: item.id });
    setError(r.ok ? null : r.error);
  };

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="rule" style={{ cursor: "pointer" }}>
        HISTORY
      </summary>
      <div className="stack" style={{ gap: 6 }}>
        {error && <div className="red">! {error}</div>}
        {items.length === 0 && !error && <div className="dim">Nothing journaled yet.</div>}
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px dashed var(--line)",
              paddingBottom: 6,
            }}
          >
            <span className="dim" style={{ fontSize: 13 }}>
              {timeOf(it.at)}
            </span>
            <span
              style={{ flex: 1, fontSize: 15, textDecoration: it.undoneBy ? "line-through" : undefined }}
              className={it.undoneBy ? "dim" : undefined}
            >
              {it.undoes && <span className="label">UNDO · </span>}
              {it.label}
            </span>
            {!it.undoneBy && (
              <button className="btn sm" onClick={() => handleUndo(it)}>
                {it.undoes ? "REDO" : "UNDO"}
              </button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
