"use client";
import { useState } from "react";

import { CharacterStats, type ActionResult, type Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { shareOrigin } from "@/lib/share-origin/share-origin";

import { CHARACTER_INVITE_HOURS } from "../../../../constants";
import { joinQr, QrDialog, type JoinQr } from "../../../qr-dialog/qr-dialog";

type SeatTabProps = { character: Character; send: Send; onResult: (r: ActionResult, ok: string) => void };

// SEAT: how a player reaches this Agent (a single-use INVITE, a GUEST QR, REVOKE GUEST QR) and LOAD STATS (JSON). The
// QR draws inside the dossier, because the dossier's modal covers anything the page would draw.
export function SeatTab({ character: c, send, onResult }: SeatTabProps) {
  const [qr, setQr] = useState<JoinQr | null>(null);
  const [importing, setImporting] = useState(false);
  const [json, setJson] = useState("");

  // Renders a join URL as a full-screen QR code.
  const showCode = async ({ title, path, token }: { title: string; path: string; token: string }) => {
    try {
      setQr(await joinQr({ title, url: `${shareOrigin(window.location)}${path}${token}` }));
    } catch (e) {
      onResult({ ok: false, error: `QR code failed: ${e instanceof Error ? e.message : "unknown error"}` }, "");
    }
  };

  // INVITE: a single-use link for one character; the player signs in (or joins as a guest) and takes that seat.
  const invite = async () => {
    const r = await send({
      type: "invite.create",
      mode: "character",
      characterId: c.id,
      hours: CHARACTER_INVITE_HOURS,
    });
    if (!r.ok || !r.token) return onResult(r, "");
    await showCode({ title: `${c.name} invite`, path: "/invite/", token: r.token });
  };

  // GUEST QR: a no-account join token for one character (the phone keeps it in a cookie).
  const guestQr = async () => {
    const r = await send({ type: "token.issue", characterId: c.id });
    if (!r.ok || !r.token) return onResult(r, "");
    await showCode({ title: c.name, path: "/join/", token: r.token });
  };

  // REVOKE GUEST QR: kills every guest token (and guest socket) for the character; signed-in members keep their seat.
  const revoke = async () =>
    onResult(await send({ type: "token.revoke", characterId: c.id }), `${c.name.toUpperCase()} GUEST LINKS REVOKED`);

  // LOAD: validates the pasted stats JSON and saves it on the character.
  const load = async () => {
    try {
      const stats = CharacterStats.parse(JSON.parse(json));
      onResult(await send({ type: "character.update", id: c.id, stats }), "STATS LOADED");
      setImporting(false);
      setJson("");
    } catch (e) {
      onResult(
        { ok: false, error: `Invalid stats JSON: ${e instanceof Error ? e.message.slice(0, 200) : "parse error"}` },
        "",
      );
    }
  };

  // CANCEL (import box): closes it and drops the pasted JSON.
  const cancel = () => {
    setImporting(false);
    setJson("");
  };

  return (
    <div className="stack">
      <div className="keys" style={{ paddingTop: 0 }}>
        <button className="btn" onClick={invite}>
          INVITE
        </button>
        <button className="btn" onClick={guestQr}>
          GUEST QR
        </button>
        <button className="btn danger" onClick={revoke}>
          REVOKE GUEST QR
        </button>
        <button className="btn" aria-expanded={importing} onClick={() => setImporting(!importing)}>
          LOAD STATS (JSON)
        </button>
      </div>
      {importing && (
        <div className="stack">
          <textarea
            className="input"
            aria-label="Stats JSON"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"species":"Primaris Astartes","attributes":{…}}'
          />
          <div className="keys">
            <button className="btn primary" onClick={load}>
              LOAD
            </button>
            <button className="btn" onClick={cancel}>
              CANCEL
            </button>
          </div>
        </div>
      )}
      {qr && <QrDialog qr={qr} onClose={() => setQr(null)} />}
    </div>
  );
}
