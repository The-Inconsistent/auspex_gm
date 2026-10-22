"use client";
import { useState, type ChangeEvent } from "react";

import { SessionTitle, type ActionResult, type Codex, type LiveState } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { FieldError } from "@/components/ui/field-error/field-error";
import { MentionField } from "@/components/ui/mention-field/mention-field";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";
import { nextSessionLine } from "@/lib/next-session/next-session";

import { DEFAULT_XP, XP_AWARDS, type PartyMsg } from "../../constants";
import { NextSession } from "../next-session/next-session";
import { PartyDialog } from "../party-dialog/party-dialog";

type SessionBandProps = {
  campaign: LiveState["campaign"];
  sessions: Codex["sessions"];
  players: number; // how many Agents Ruin starts at
  send: Send;
  msg: PartyMsg | null;
  onResult: (r: ActionResult, ok: string) => void;
};

// PARTY's one-row SESSION band: where the session stands, its one primary (START SESSION n, or END SESSION… which opens
// the end form), and NEXT SESSION as a quiet button showing the date. The session journal sits below the roster.
export function SessionBand({ campaign, sessions, players, send, msg, onResult }: SessionBandProps) {
  const open = sessions.find((s) => !s.endedAt);
  const [ending, setEnding] = useState(false); // the end form's dialog
  const [planning, setPlanning] = useState(false); // the next-session form's dialog
  const [xp, setXp] = useState<number>(DEFAULT_XP);
  const [recap, setRecap] = useState("");
  const [title, setTitle] = useState(""); // the next session's name, sent with START SESSION (issue #175)
  const sessionFields = useFieldErrors("start-title"); // START SESSION's title

  // XP input: digits only.
  const handleXpChange = (e: ChangeEvent<HTMLInputElement>) => setXp(Number(e.target.value.replace(/\D/g, "")) || 0);

  // START SESSION: resets the pools per the rules (p.162).
  const startSession = async () => {
    const named = sessionFields.check(SessionTitle, title);
    if (named === null) return;
    const r = await send({ type: "session.start", title: named });
    onResult(r, "SESSION STARTED · POOLS RESET");
    if (r.ok) setTitle("");
  };

  // END SESSION: awards XP to everyone and saves the recap.
  const endSession = async () => {
    const r = await send({ type: "session.end", xp, recap });
    onResult(r, `SESSION ENDED · +${xp} XP EACH`);
    if (r.ok) setEnding(false);
  };

  // END SESSION WITHOUT XP: closes a session that was never played or left open; no XP, no Rank notices, pools as they are.
  const abandonSession = async () => {
    const r = await send({ type: "session.abandon" });
    onResult(r, "SESSION ENDED · NO XP");
    if (r.ok) setEnding(false);
  };

  // NEXT SESSION's SAVE or CLEAR: a saved date closes the form.
  const planned = (r: ActionResult, ok: string) => {
    onResult(r, ok);
    if (r.ok) setPlanning(false);
  };

  const next = campaign.nextSessionAt
    ? `NEXT: ${nextSessionLine(campaign.nextSessionAt, campaign.nextSessionPlace).toUpperCase()}`
    : "NEXT SESSION: SET DATE";

  return (
    <section id="session" aria-label="Session" className="party-band">
      <span className="party-band-state">
        <span className="label">
          {open ? `SESSION ${open.number} · LIVE` : "NO SESSION RUNNING"}
          {open?.title ? ` · ${open.title.toUpperCase()}` : ""}
        </span>
        {!open && (
          <span className="dim">Starting one resets every Wrath → 2, Glory → 0, Ruin → {players} (p.162).</span>
        )}
      </span>
      {!open && (
        <span className="party-band-title">
          <input
            id="start-title"
            className="input"
            aria-label="Session title"
            placeholder="TITLE (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...sessionFields.marks()}
          />
          <FieldError {...sessionFields.reason()} />
        </span>
      )}
      <button className="btn party-quiet" onClick={() => setPlanning(true)} aria-label={`Edit next session: ${next}`}>
        {next}
      </button>
      {open ? (
        <button className="btn primary" onClick={() => setEnding(true)}>
          END SESSION…
        </button>
      ) : (
        <button className="btn primary" onClick={startSession}>
          START SESSION {sessions.length + 1}
        </button>
      )}

      {ending && open && (
        <PartyDialog
          label="End session"
          title={`END SESSION ${open.number}`}
          msg={msg}
          onClose={() => setEnding(false)}
        >
          <div className="field">
            <label className="label" htmlFor="xp">
              XP EACH (8 / 10 / 12, p.321)
            </label>
            <div className="keys" role="group" aria-label="XP each" style={{ paddingTop: 0 }}>
              {XP_AWARDS.map((n) => (
                <button
                  key={n}
                  className={`btn ${xp === n ? "primary" : ""}`}
                  aria-pressed={xp === n}
                  onClick={() => setXp(n)}
                >
                  {n}
                </button>
              ))}
              <input
                id="xp"
                className="input"
                style={{ width: 80 }}
                inputMode="numeric"
                value={xp}
                onChange={handleXpChange}
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="recap">
              RECAP (players see this)
            </label>
            <MentionField
              id="recap"
              multiline
              value={recap}
              onChange={setRecap}
              placeholder="Previously in Wrath & Glory…"
            />
          </div>
          <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
            <button className="btn primary" onClick={endSession}>
              END SESSION
            </button>
            <ConfirmAction
              label="END SESSION WITHOUT XP"
              prompt="End this session with no XP and no recap?"
              onConfirm={abandonSession}
            />
          </div>
        </PartyDialog>
      )}
      {planning && (
        <PartyDialog label="Next session" title="NEXT SESSION" msg={msg} onClose={() => setPlanning(false)}>
          <NextSession
            key={`${campaign.nextSessionAt}|${campaign.nextSessionPlace}`}
            campaign={campaign}
            send={send}
            onResult={planned}
          />
        </PartyDialog>
      )}
    </section>
  );
}
