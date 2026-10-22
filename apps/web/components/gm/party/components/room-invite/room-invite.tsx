"use client";
import { useState } from "react";

import type { Send } from "@/hooks/use-table/use-table";
import { qrImage } from "@/lib/qr/qr";
import { shareOrigin } from "@/lib/share-origin/share-origin";

import { ROOM_INVITE_HOURS } from "../../constants";
import { QrDialog, type JoinQr } from "../qr-dialog/qr-dialog";

type RoomInviteProps = { send: Send; onError: (error: string) => void; compact?: boolean }; // compact: just the button

// ROOM QR: one code for the whole table tonight; each player claims an open agent or starts a new one. PARTY and NEW
// CAMPAIGN's PLAYERS step both offer it.
export function RoomInvite({ send, onError, compact }: RoomInviteProps) {
  const [qr, setQr] = useState<JoinQr | null>(null);

  const handleInvite = async () => {
    const r = await send({ type: "invite.create", mode: "room", hours: ROOM_INVITE_HOURS });
    if (!r.ok) return onError(r.error);
    if (!r.token) return;
    const url = `${shareOrigin(window.location)}/invite/${r.token}`;
    try {
      setQr({ title: "Room", url, img: await qrImage(url) });
    } catch (e) {
      onError(`QR code failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  return (
    <>
      {compact ? (
        <button className="btn" onClick={handleInvite}>
          ROOM QR
        </button>
      ) : (
        <div className="keys" style={{ paddingTop: 0 }}>
          <button className="btn primary" onClick={handleInvite}>
            ROOM QR
          </button>
          <span className="dim">
            Players scan it, sign in or join as a guest, and claim an agent. Live {ROOM_INVITE_HOURS} h.
          </span>
        </div>
      )}
      {qr && <QrDialog qr={qr} onClose={() => setQr(null)} />}
    </>
  );
}
