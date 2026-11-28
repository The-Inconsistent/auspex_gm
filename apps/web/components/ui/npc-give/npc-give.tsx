"use client";
import { useState } from "react";

import { canGive, type Character, type Codex } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type Npc = Codex["npcs"][number];
type NpcGiveProps = {
  npc: Npc;
  characters: Character[];
  send: Send;
  onError: (error: string | null) => void;
};

// GIVE TO an Agent as a follower, or TAKE BACK once given (issue #350, rules-flow §11.208), as ItemGive does for an item.
// The server refuses what the rules refuse (no open session, an NPC that already follows someone); the refusal shows where
// it was tapped. An Ally is never given, so it offers no GIVE and says why.
export function NpcGive({ npc, characters, send, onError }: NpcGiveProps) {
  const [to, setTo] = useState("");
  const holder = characters.find((c) => c.id === npc.followsId);

  // GIVE: the picked Agent takes the NPC as a follower.
  const give = async () => {
    const r = await send({ type: "npc.give", id: npc.id, characterId: to });
    onError(r.ok ? null : r.error);
    if (r.ok) setTo("");
  };
  // TAKE BACK: the follow ends; in a fight its row goes back to the GM.
  const takeBack = async () => {
    const r = await send({ type: "npc.takeBack", id: npc.id });
    onError(r.ok ? null : r.error);
  };

  if (npc.followsId)
    return (
      <span className="keys" style={{ padding: 0 }}>
        <span className="chip ally">FOLLOWS {(holder?.name ?? "an Agent").toUpperCase()}</span>
        <button
          className="btn sm"
          onClick={takeBack}
          aria-label={`Take ${npc.name} back from ${holder?.name ?? "an Agent"}`}
        >
          TAKE BACK
        </button>
      </span>
    );
  if (!canGive(npc.fightsAs)) return <span className="dim">Ally: only the GM runs it</span>;
  return (
    <span className="keys" style={{ padding: 0 }}>
      <select
        className="input"
        style={{ width: "auto" }}
        aria-label={`Give ${npc.name} to`}
        value={to}
        onChange={(e) => setTo(e.target.value)}
      >
        <option value="">GIVE TO…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="btn sm" disabled={!to} onClick={give}>
        GIVE
      </button>
    </span>
  );
}
