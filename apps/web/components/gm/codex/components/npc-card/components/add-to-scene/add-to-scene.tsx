"use client";
import { useState } from "react";

import type { Codex } from "@wg/shared";

import { sceneNumber } from "@/components/gm/prep/utils";
import type { Send } from "@/hooks/use-table/use-table";
import { addNpcToBeat } from "@/lib/add-to-scene/add-to-scene";

type AddToSceneProps = {
  npc: Codex["npcs"][number];
  adventures: Codex["adventures"];
  send: Send;
  onError: (e: string | null) => void;
};

// ADD TO SCENE (issue #47): puts a bestiary NPC into one scene's prepared encounter, so START ENCOUNTER fields them.
// A Quick NPC or one with no stats has nothing to snapshot as a combatant (rules-flow §11.88).
export function AddToScene({ npc, adventures, send, onError }: AddToSceneProps) {
  const [adventureId, setAdventureId] = useState("");
  const [beatId, setBeatId] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null); // the scene it last went into
  // The picks fall back to the first adventure and scene, so a scene added or deleted since never strands them.
  const adventure = adventures.find((a) => a.id === adventureId) ?? adventures[0];
  const beats = adventure?.beats ?? [];
  const beat = beats.find((b) => b.id === beatId) ?? beats[0];
  const fieldable = npc.statSource.kind === "bestiary";

  // Adventure select: the scene list follows it, starting at its first scene.
  const pickAdventure = (id: string) => {
    setAdventureId(id);
    setBeatId("");
  };

  // ADD TO SCENE: one codex.save of the whole beat; the server checks the threat and the encounter caps.
  const add = async () => {
    const data = beat && addNpcToBeat(beat, npc);
    if (!beat || !data || adding) return;
    setAdding(true);
    const r = await send({ type: "codex.save", kind: "beat", id: beat.id, data });
    setAdding(false);
    onError(r.ok ? null : r.error);
    if (r.ok) setAdded(beat.title);
  };

  if (!fieldable)
    return (
      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn" disabled>
          ADD TO SCENE
        </button>
        <span className="dim">
          {npc.statSource.kind === "quick"
            ? "A Quick NPC can't fight: it has no Attributes or weapons for a combatant. Pick a bestiary threat as its stat source to field it."
            : "Pick a bestiary threat as the stat source to field this NPC."}
        </span>
      </div>
    );
  if (adventures.every((a) => a.beats.length === 0))
    return <div className="dim">Add a scene in STORY to field this NPC.</div>;
  return (
    <div className="panel pad stack" style={{ gap: 8 }}>
      <span className="label">ADD TO SCENE</span>
      <label className="label" htmlFor={`ats-adv-${npc.id}`}>
        ADVENTURE
      </label>
      <select
        id={`ats-adv-${npc.id}`}
        className="input"
        value={adventure?.id ?? ""}
        onChange={(e) => pickAdventure(e.target.value)}
      >
        {adventures.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title.toUpperCase()}
          </option>
        ))}
      </select>
      <label className="label" htmlFor={`ats-beat-${npc.id}`}>
        SCENE
      </label>
      <select
        id={`ats-beat-${npc.id}`}
        className="input"
        value={beat?.id ?? ""}
        onChange={(e) => setBeatId(e.target.value)}
      >
        {beats.map((b, i) => (
          <option key={b.id} value={b.id}>
            {sceneNumber(i)} · {b.title.toUpperCase()}
          </option>
        ))}
      </select>
      <button className="btn" onClick={add} disabled={!beat || adding}>
        ADD TO SCENE
      </button>
      <span className="dim">
        {added
          ? `Added to ${added}.`
          : `Adds "${npc.name}" ×1 to that scene's prepared encounter and lists them as present. START ENCOUNTER fields them.`}
      </span>
    </div>
  );
}
