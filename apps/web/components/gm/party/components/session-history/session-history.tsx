"use client";
import { useState } from "react";

import { SessionJournal, type ActionResult, type Codex } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { FieldError } from "@/components/ui/field-error/field-error";
import { MentionField } from "@/components/ui/mention-field/mention-field";
import { Mentions } from "@/components/ui/mentions/mentions";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

type Session = Codex["sessions"][number];
type SessionHistoryProps = { sessions: Codex["sessions"]; send: Send; onResult: (r: ActionResult, ok: string) => void };

// PARTY › SESSION, below the controls: the session journal (issue #195), newest first. EDIT fixes an ended session's
// recap and keeps the GM's notes, a running one's included (its recap is written at END SESSION, §11.153); XP was paid
// out and stays (§11.152). DELETE LAST SESSION is for one that was never played or ended by mistake: only the latest
// can go (the numbering stays unbroken), and only once it has ended. The XP it awarded stays on the characters.
export function SessionHistory({ sessions, send, onResult }: SessionHistoryProps) {
  const [editing, setEditing] = useState<string | null>(null);
  // What the editor opened with, and the edits. SAVE sends only what changed since: a running session's editor left
  // open through END SESSION must not blank the recap END just wrote, nor undo another tablet's edit.
  const [opened, setOpened] = useState({ recap: "", notes: "", ended: false });
  const [draft, setDraft] = useState({ recap: "", notes: "" });
  const fields = useFieldErrors("session-");
  const latest = sessions.at(-1);
  if (!latest) return null;

  // EDIT: one session's recap and notes, with no marks left from an earlier SAVE.
  const edit = (s: Session) => {
    fields.reset();
    setOpened({ recap: s.recap, notes: s.notes, ended: !!s.endedAt });
    setDraft({ recap: s.recap, notes: s.notes });
    setEditing(s.id);
  };

  // SAVE: the fields edited since EDIT; the recap only if the session had ended by then.
  const save = async (s: Session) => {
    const data = fields.check(SessionJournal, {
      ...(opened.ended && draft.recap !== opened.recap && { recap: draft.recap }),
      ...(draft.notes !== opened.notes && { notes: draft.notes }),
    });
    if (!data) return;
    if (!Object.keys(data).length) return setEditing(null); // nothing changed
    const r = await send({ type: "session.edit", sessionId: s.id, ...data });
    onResult(r, `SESSION ${s.number} SAVED`);
    if (r.ok) setEditing(null);
  };

  // DELETE LAST SESSION: what the server removed, and what it kept, is its notice.
  const deleteLast = async () => {
    const r = await send({ type: "session.delete" });
    onResult(r, "LAST SESSION DELETED");
  };

  return (
    <div className="stack">
      <div className="label">SESSIONS</div>
      <div className="list">
        {[...sessions].reverse().map((s) => (
          <div key={s.id} className="item">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ flex: 1 }}>
                SESSION {s.number}
                {s.endedAt ? "" : " · IN PROGRESS"}
              </b>
              <span className="dim">
                STARTED {new Date(s.startedAt).toLocaleDateString()}
                {s.endedAt ? ` · ENDED ${new Date(s.endedAt).toLocaleDateString()} · +${s.xp} XP EACH` : ""}
              </span>
              {editing !== s.id && (
                <button className="btn sm" aria-label={`Edit session ${s.number}`} onClick={() => edit(s)}>
                  EDIT
                </button>
              )}
            </div>
            {editing === s.id ? (
              <div className="stack">
                {opened.ended && (
                  <div className="field">
                    <label className="label" htmlFor="session-recap">
                      RECAP (players see this)
                    </label>
                    <MentionField
                      id="session-recap"
                      multiline
                      value={draft.recap}
                      onChange={(recap) => setDraft({ ...draft, recap })}
                      {...fields.marks("recap")}
                    />
                    <FieldError {...fields.reason("recap")} />
                  </div>
                )}
                <div className="field plate">
                  <label className="label" htmlFor="session-notes">
                    NOTES (GM only)
                  </label>
                  <MentionField
                    id="session-notes"
                    multiline
                    value={draft.notes}
                    onChange={(notes) => setDraft({ ...draft, notes })}
                    {...fields.marks("notes")}
                  />
                  <FieldError {...fields.reason("notes")} />
                </div>
                <div className="keys">
                  <button className="btn sm primary" onClick={() => save(s)}>
                    SAVE
                  </button>
                  <button className="btn sm" onClick={() => setEditing(null)}>
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <>
                {s.recap && (
                  <pre className="text dim">
                    <Mentions text={s.recap} />
                  </pre>
                )}
                {/* The GM's own, so it stays closed like the other GM-only text on a tablet the table can see. */}
                {s.notes && (
                  <details className="field plate">
                    <summary className="label">NOTES · TAP TO REVEAL</summary>
                    <pre className="text">
                      <Mentions text={s.notes} />
                    </pre>
                  </details>
                )}
              </>
            )}
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
