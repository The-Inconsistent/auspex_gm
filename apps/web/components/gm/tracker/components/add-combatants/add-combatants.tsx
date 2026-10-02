"use client";
import { useState, type ChangeEvent } from "react";

import { activeCharacterIds, Marker, type LiveState, type Threat, type Visibility } from "@wg/shared";

import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";
import { VisibilitySelect } from "@/components/ui/visibility-select/visibility-select";

import type { Run } from "../../types";

type AddCombatantsProps = { state: LiveState; run: Run; bestiary: Threat[] };

export function AddCombatants({ state, run, bestiary }: AddCombatantsProps) {
  const [threatId, setThreatId] = useState("");
  const [mob, setMob] = useState("");
  const [marker, setMarker] = useState<Marker | null>(null);
  // Kept between adds, like the marker: a GM placing reinforcements adds several hidden in a row.
  const [visibility, setVisibility] = useState<Visibility>("bars");
  const inFight = new Set(state.encounter?.combatants.flatMap((c) => (c.kind === "pc" ? [c.characterId] : [])));
  const active = activeCharacterIds(state.access); // reserve Agents stay out of the fight
  const missing = state.characters.filter((c) => active.has(c.id) && !inFight.has(c.id));
  const threat = bestiary.find((x) => x.id === threatId);
  const mobCount = Number(mob);

  // Mob size: digits only.
  const handleMobChange = (e: ChangeEvent<HTMLInputElement>) => setMob(e.target.value.replace(/\D/g, ""));

  // Marker picker: the empty option clears it.
  const handleMarkerChange = (e: ChangeEvent<HTMLSelectElement>) =>
    setMarker(Marker.safeParse(e.target.value).data ?? null);

  // ADD: puts the picked threat in the fight (as a mob when 2+), then resets the picker.
  const handleAdd = async () => {
    if (!threat) return;
    const isMob = mobCount >= 2;
    await run(
      {
        type: "combatant.addThreat",
        threatId: threat.id,
        ...(isMob ? { mobCount } : {}),
        ...(marker ? { marker } : {}),
        visibility,
      },
      `+ ${threat.name.toUpperCase()}${isMob ? ` ×${mob}` : ""}`,
    );
    setMob("");
    setThreatId("");
  };

  // + PARTY: adds every character not yet in the fight, in order.
  const handleAddParty = async () => {
    for (const c of missing)
      await run({ type: "combatant.addCharacter", characterId: c.id }, `+ ${c.name.toUpperCase()}`);
  };

  return (
    <div className="keys" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <ThreatPicker bestiary={bestiary} tier={state.campaign.tier} value={threatId} onPick={(t) => setThreatId(t.id)} />
      <input
        className="input"
        style={{ width: 90 }}
        inputMode="numeric"
        aria-label="Mob size"
        placeholder="MOB #"
        value={mob}
        onChange={handleMobChange}
      />
      <select className="btn" aria-label="Marker colour" value={marker ?? ""} onChange={handleMarkerChange}>
        <option value="">MARKER</option>
        {Marker.options.map((m) => (
          <option key={m} value={m}>
            {m.toUpperCase()}
          </option>
        ))}
      </select>
      <VisibilitySelect value={visibility} onChange={setVisibility} />
      <button className="btn" disabled={!threat} onClick={handleAdd}>
        ADD
      </button>
      {missing.length > 0 && (
        <button className="btn" onClick={handleAddParty}>
          + PARTY ({missing.length})
        </button>
      )}
    </div>
  );
}
