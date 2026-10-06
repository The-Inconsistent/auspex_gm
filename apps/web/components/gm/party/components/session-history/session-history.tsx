"use client";
import type { ActionResult, Codex } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import type { Send } from "@/hooks/use-table/use-table";

import { PAST_SESSIONS_SHOWN } from "./constants";

type SessionHistoryProps = { sessions: Codex["sessions"]; send: Send; onResult: (r: ActionResult, ok: string) => void };

// PARTY › SESSION, below the controls: the latest sessions, and DELETE LAST SESSION for one that was never played
// or ended by mistake. Only the latest can go (the numbering stays unbroken), and only once it has ended. The XP it
// awarded stays on the characters; the server's notice says so.
export function SessionHistory({ sessions, send, onResult }: SessionHistoryProps) {
  const latest = sessions.at(-1);
  if (!latest) return null;
  const shown = sessions.slice(-PAST_SESSIONS_SHOWN).reverse();

  // DELETE LAST SESSION: what the server removed, and what it kept, is its notice.
  const deleteLast = async () => {
    const r = await send({ type: "session.delete" });
    onResult(r, "LAST SESSION DELETED");
  };

  return (
    <div className="stack">
      <div className="label">LATEST SESSIONS</div>
      <div className="list">
        {shown.map((s) => (
          <div key={s.id} className="item">
            <b>
              SESSION {s.number}
              {s.endedAt ? "" : " · IN PROGRESS"}
            </b>
            <span className="dim">
              STARTED {new Date(s.startedAt).toLocaleDateString()}
              {s.endedAt ? ` · ENDED ${new Date(s.endedAt).toLocaleDateString()} · +${s.xp} XP EACH` : ""}
            </span>
          </div>
        ))}
      </div>
      {latest.endedAt && (
        <div>
          <ConfirmAction
            label="DELETE LAST SESSION"
            prompt={`Delete session ${latest.number}? Any XP it awarded stays on the characters.`}
            onConfirm={deleteLast}
          />
        </div>
      )}
    </div>
  );
}
