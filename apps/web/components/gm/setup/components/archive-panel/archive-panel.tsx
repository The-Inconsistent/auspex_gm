"use client";
import { useState } from "react";

import type { ActionResult, LiveState } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { DeleteGame } from "@/components/ui/delete-game/delete-game";
import type { Send } from "@/hooks/use-table/use-table";

type ArchivePanelProps = { campaign: LiveState["campaign"]; send: Send; onDeleted: () => void };

// SETUP › ARCHIVE: shelve a finished game, bring it back, or delete it. An archived game is read-only for everyone
// (the server refuses every action but UNARCHIVE and DELETE), and the lobby lists it apart under ARCHIVED.
export function ArchivePanel({ campaign, send, onDeleted }: ArchivePanelProps) {
  const [msg, setMsg] = useState<string | null>(null);

  // ARCHIVE / UNARCHIVE: shows a refusal, or what happened.
  const report = (r: ActionResult, ok: string) => setMsg(r.ok ? ok : `! ${r.error}`);

  // ARCHIVE GAME: read-only from here; a session in progress ends with no XP.
  const archive = async () => report(await send({ type: "campaign.archive" }), "GAME ARCHIVED");

  // UNARCHIVE: the game plays again.
  const unarchive = async () => report(await send({ type: "campaign.unarchive" }), "GAME UNARCHIVED");

  // DELETE GAME: the server checks the typed name. Once it's applied the room is dropped, so leave for the lobby.
  const deleteGame = async (name: string) => {
    const r = await send({ type: "campaign.delete", name });
    if (r.ok) return onDeleted();
    report(r, "");
  };

  return (
    <section className="panel pad stack">
      <div className="rule">{campaign.archived ? "ARCHIVED GAME" : "ARCHIVE"}</div>
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}
      {campaign.archived ? (
        <>
          <div className="dim">
            This game is read-only. UNARCHIVE it to play on, or delete it for good (EXPORT first if you might want it
            back).
          </div>
          <div className="keys">
            <button className="btn primary" onClick={unarchive}>
              UNARCHIVE
            </button>
            <a className="btn" href={`/api/campaigns/${campaign.id}/export`} download>
              EXPORT
            </a>
          </div>
          <DeleteGame name={campaign.name} exportHref={`/api/campaigns/${campaign.id}/export`} onDelete={deleteGame} />
        </>
      ) : (
        <>
          <div className="dim">
            For a game that has finished. Nothing at the table can change until you unarchive it, a session in progress
            ends with no XP, and the lobby moves the game under ARCHIVED.
          </div>
          <div>
            <ConfirmAction
              label="ARCHIVE GAME"
              prompt="Archive this game? It turns read-only for everyone."
              confirmLabel="ARCHIVE"
              onConfirm={archive}
            />
          </div>
        </>
      )}
    </section>
  );
}
