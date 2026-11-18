"use client";
import { useState } from "react";

import type { JournalItem } from "@wg/shared";

import { PartyDialog } from "@/components/gm/party/components/party-dialog/party-dialog";
import type { Send } from "@/hooks/use-table/use-table";

type JournalHistoryProps = {
  // The api pushes these over the socket after every journaled action (newest first); nothing is fetched here.
  items: JournalItem[];
  send: Send;
  onClose: () => void;
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// HISTORY (the tracker's MORE): the server's journal of this campaign as a dialog, newest first. UNDO on a standing
// entry, REDO on an undo entry (undoing an undo). A refusal ("Undo … first.") shows at the top. The tracker mounts it
// only while open.
export function JournalHistory({ items, send, onClose }: JournalHistoryProps) {
  const [error, setError] = useState<string | null>(null);

  // UNDO / REDO: asks the server to revert the entry; a refusal ("Undo … first.") shows at the top.
  const handleUndo = async (item: JournalItem) => {
    const r = await send({ type: "journal.undo", entryId: item.id });
    setError(r.ok ? null : r.error);
  };

  return (
    <PartyDialog label="History: every action of this campaign" title="HISTORY" msg={null} onClose={onClose}>
      {error && (
        <div className="red" role="alert">
          ! {error}
        </div>
      )}
      {items.length === 0 && <div className="dim">Nothing journaled yet.</div>}
      <div className="chronicle-log">
        {items.map((it) => (
          <div key={it.id} className="history-row">
            <span className="dim">{timeOf(it.at)}</span>
            <span className={`history-what${it.undoneBy ? " undone" : ""}`}>
              {it.undoes && <span className="label">UNDO · </span>}
              {it.undoneBy && "UNDONE · "}
              {it.label}
            </span>
            {!it.undoneBy && (
              <button
                className="btn sm"
                aria-label={`${it.undoes ? "Redo" : "Undo"}: ${it.label}`}
                onClick={() => handleUndo(it)}
              >
                {it.undoes ? "REDO" : "UNDO"}
              </button>
            )}
          </div>
        ))}
      </div>
    </PartyDialog>
  );
}
