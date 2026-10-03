"use client";
import type { Codex } from "@wg/shared";

import { placeOptions } from "@/lib/places/places";

type Holder = { locationId: string | null; npcId: string | null };
type HolderFieldProps = Holder & {
  id: string;
  codex: Codex;
  onChange: (v: Holder) => void;
};

const MODES = [
  ["nobody", "NOBODY"],
  ["place", "A PLACE"],
  ["npc", "AN NPC"],
] as const;

// Where an item lies, or who carries it: one or the other (issue #51). Giving it to an Agent clears it.
export function HolderField({ id, locationId, npcId, codex, onChange }: HolderFieldProps) {
  const mode = npcId !== null ? "npc" : locationId !== null ? "place" : "nobody";
  // NOBODY / A PLACE / AN NPC: a new mode starts at its first choice.
  const pickMode = (m: (typeof MODES)[number][0]) =>
    onChange({
      locationId: m === "place" ? (codex.locations[0]?.id ?? null) : null,
      npcId: m === "npc" ? (codex.npcs[0]?.id ?? null) : null,
    });
  const options =
    mode === "place"
      ? placeOptions(codex.locations)
      : mode === "npc"
        ? codex.npcs.map((n): [string, string] => [n.id, n.name])
        : [];
  return (
    <div className="keys" role="group" aria-labelledby={id} style={{ paddingTop: 0 }}>
      {MODES.map(([m, label]) => (
        <button
          key={m}
          className={`btn sm ${mode === m ? "primary" : ""}`}
          aria-pressed={mode === m}
          // A place or an NPC needs one to pick: add it in CODEX first.
          disabled={(m === "place" && !codex.locations.length) || (m === "npc" && !codex.npcs.length)}
          onClick={() => pickMode(m)}
        >
          {label}
        </button>
      ))}
      {mode !== "nobody" && (
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label={mode === "place" ? "Where it lies" : "Who carries it"}
          value={(mode === "place" ? locationId : npcId) ?? ""}
          onChange={(e) =>
            onChange(
              mode === "place"
                ? { locationId: e.target.value, npcId: null }
                : { locationId: null, npcId: e.target.value },
            )
          }
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
