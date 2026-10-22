"use client";
import type { ActionResult, LiveState, Member } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type TableAccessProps = { state: LiveState; send: Send; onResult: (r: ActionResult, ok: string) => void };

// TABLE ACCESS: the open invites (each can be revoked) and the signed-in members (a player can be removed).
export function TableAccess({ state, send, onResult }: TableAccessProps) {
  const { members, invites } = state.access;
  const nameOf = (characterId: string | null) => state.characters.find((c) => c.id === characterId)?.name ?? "?";

  // REVOKE (invite): the link stops working; anyone already seated keeps their seat.
  const revokeInvite = async (id: string) => onResult(await send({ type: "invite.revoke", id }), "INVITE REVOKED");

  // REMOVE (member): takes away their seat and disconnects them.
  const removeMember = async (m: Member) =>
    onResult(await send({ type: "member.remove", userId: m.userId }), `${m.name.toUpperCase()} REMOVED`);

  return (
    <div className="stack">
      {invites.length > 0 && (
        <div className="list">
          {invites.map((i) => (
            <div key={i.id} className="item" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>
                {i.mode === "room" ? "ROOM" : nameOf(i.characterId).toUpperCase()} · {i.uses} USED
                {i.allowGuests ? "" : " · ACCOUNTS ONLY"}
              </span>
              <span className="dim">UNTIL {new Date(i.expiresAt).toLocaleString()}</span>
              <button className="btn sm danger" onClick={() => revokeInvite(i.id)}>
                REVOKE
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="label">SIGNED IN</div>
      {members.map((m) => (
        <div key={m.userId} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            {m.name.toUpperCase()} ·{" "}
            {m.role === "gm" ? "GM" : m.characterId ? nameOf(m.characterId).toUpperCase() : "NO AGENT"}
          </span>
          {m.role === "player" && (
            <button className="btn sm danger" onClick={() => removeMember(m)}>
              REMOVE
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
