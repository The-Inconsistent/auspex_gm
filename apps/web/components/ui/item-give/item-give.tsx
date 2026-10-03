"use client";
import { useState } from "react";

import type { Character, Codex } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type Item = Codex["items"][number];
type ItemGiveProps = {
  item: Item;
  characters: Character[];
  send: Send;
  onError: (error: string | null) => void;
};

// Where an item is now (issue #51): with an Agent, carried by an NPC, lying in a place, or nowhere yet.
export function holderOf(item: Item, { codex, characters }: { codex: Codex; characters: Character[] }) {
  if (item.givenTo) return { label: "WITH", name: characters.find((c) => c.id === item.givenTo)?.name ?? "an Agent" };
  if (item.npcId) return { label: "CARRIED BY", name: codex.npcs.find((n) => n.id === item.npcId)?.name ?? "?" };
  if (item.locationId) return { label: "AT", name: codex.locations.find((l) => l.id === item.locationId)?.name ?? "?" };
  return { label: "NO HOLDER", name: "" };
}

// GIVE TO an Agent, or TAKE BACK once given (rules-flow.md §11.112–§11.114). The server builds the sheet line and refuses
// what the rules refuse (no session, the Wargear Test spent, a full gear list); the refusal shows where it was tapped.
export function ItemGive({ item, characters, send, onError }: ItemGiveProps) {
  const [to, setTo] = useState("");
  const holder = characters.find((c) => c.id === item.givenTo);

  // GIVE: hand the item to the picked Agent.
  const give = async () => {
    const r = await send({ type: "character.giveItem", id: to, itemId: item.id });
    onError(r.ok ? null : r.error);
    if (r.ok) setTo("");
  };
  // TAKE BACK: off the Agent's sheet, and loose again.
  const takeBack = async () => {
    if (!item.givenTo) return;
    const r = await send({ type: "character.takeItem", id: item.givenTo, itemId: item.id });
    onError(r.ok ? null : r.error);
  };

  if (item.givenTo)
    return (
      <span className="keys" style={{ padding: 0 }}>
        <span className="chip">GIVEN</span>
        <button className="btn sm" onClick={takeBack} aria-label={`Take ${item.name} back from ${holder?.name}`}>
          TAKE BACK
        </button>
      </span>
    );
  return (
    <span className="keys" style={{ padding: 0 }}>
      <select
        className="input"
        style={{ width: "auto" }}
        aria-label={`Give ${item.name} to`}
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
