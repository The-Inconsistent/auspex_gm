"use client";
import { useRef, useState, type ChangeEvent } from "react";

import {
  activeCharacterIds,
  agentsInFight,
  encounterBudget,
  isOut,
  Marker,
  tallyByClass,
  type LiveState,
  type ProfileId,
  type Threat,
  type Visibility,
} from "@wg/shared";

import { BudgetLines } from "@/components/ui/budget-lines/budget-lines";
import { Refusal } from "@/components/ui/refusal/refusal";
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";
import { ThreatScale } from "@/components/ui/threat-scale/threat-scale";
import { VisibilitySelect } from "@/components/ui/visibility-select/visibility-select";

import type { Run } from "../../types";

type AddCombatantsProps = { state: LiveState; run: Run; bestiary: Threat[] };

// ADD TO FIGHT: one button under the table, the picker, scaling and the Building Encounters check in a native modal
// <dialog> (Escape, focus trap, backdrop, as Legend does). It stays open after ADD: reinforcements come several at once.
export function AddCombatants({ state, run, bestiary }: AddCombatantsProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // The tracker's error line sits behind the modal, so a refused ADD shows its reason in here.
  const [error, setError] = useState<string | null>(null);
  const [threatId, setThreatId] = useState("");
  const [mob, setMob] = useState("");
  const [marker, setMarker] = useState<Marker | null>(null);
  // Kept between adds, like the marker: a GM placing reinforcements adds several hidden in a row.
  const [visibility, setVisibility] = useState<Visibility>("bars");
  // Profiles (VoA p.126) and scaling (Core p.326) reset with the picker, so the next threat starts from its stat block.
  const [profiles, setProfiles] = useState<ProfileId[]>([]);
  const [scale, setScale] = useState(false);
  const inFight = new Set(state.encounter?.combatants.flatMap((c) => (c.kind === "pc" ? [c.characterId] : [])));
  const active = activeCharacterIds(state.access); // reserve Agents stay out of the fight
  const missing = state.characters.filter((c) => active.has(c.id) && !inFight.has(c.id));
  const threat = bestiary.find((x) => x.id === threatId);
  const mobCount = Number(mob);
  // The fight as it stands, against the same guideline STORY uses (Threat Assessment p.8). The class was resolved when
  // each threat joined, and a Mob's models are the members still standing. Anything out of the fight (`isOut`: a slain
  // threat, a dead Agent) has stopped being something to keep track of, so it leaves the tally even while its row waits
  // for the GM to remove it.
  const standing = (state.encounter?.combatants ?? []).filter((c) => !isOut(state, c));
  const tally = tallyByClass(
    standing.flatMap((c) =>
      c.kind === "threat" ? [{ cls: c.threatClass, count: c.mobCount ?? 1, asMob: c.mobCount !== null }] : [],
    ),
  );
  // Sized for the Agents in the fight, falling back to the seated ones before + PARTY, as STORY does: a budget of 0
  // Troops would read OVER against the first threat the GM places.
  const agents = standing.filter((c) => c.kind === "pc").length || agentsInFight(state);
  const budget = encounterBudget({ agents });
  // The scaling preview counts the seated Agents, which is what the server scales by (claimedCharacterIds, §11.106),
  // not the rows already placed.
  const seated = agentsInFight(state);

  // Mob size: digits only.
  const handleMobChange = (e: ChangeEvent<HTMLInputElement>) => setMob(e.target.value.replace(/\D/g, ""));

  // Marker picker: the empty option clears it.
  const handleMarkerChange = (e: ChangeEvent<HTMLSelectElement>) =>
    setMarker(Marker.safeParse(e.target.value).data ?? null);

  // ADD: puts the picked threat in the fight (as a mob when 2+), then resets the picker.
  const handleAdd = async () => {
    if (!threat) return;
    const isMob = mobCount >= 2;
    const res = await run(
      {
        type: "combatant.addThreat",
        threatId: threat.id,
        ...(isMob ? { mobCount } : {}),
        ...(marker ? { marker } : {}),
        visibility,
        profiles,
        scale,
      },
      `+ ${threat.name.toUpperCase()}${isMob ? ` ×${mob}` : ""}`,
    );
    if (!res.ok) return setError(res.error); // keep the picks, so the GM can fix one and ADD again
    setMob("");
    setThreatId("");
    setProfiles([]);
    setScale(false);
  };

  // + PARTY: adds every character not yet in the fight, in order.
  const handleAddParty = async () => {
    for (const c of missing) {
      const res = await run({ type: "combatant.addCharacter", characterId: c.id }, `+ ${c.name.toUpperCase()}`);
      if (!res.ok) return setError(res.error);
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>
        ADD TO FIGHT
      </button>
      <dialog
        ref={ref}
        className="sheet"
        aria-label="Add to the fight"
        onClose={() => setError(null)}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>ADD TO THE FIGHT</span>
        </div>
        <div className="stack pad">
          <div className="keys">
            <ThreatPicker
              bestiary={bestiary}
              tier={state.campaign.tier}
              value={threatId}
              onPick={(t) => setThreatId(t.id)}
            />
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
          <ThreatScale
            threat={threat}
            tier={state.campaign.tier}
            agents={seated}
            asMob={mobCount >= 2}
            profiles={profiles}
            scale={scale}
            onChange={(next) => {
              setProfiles(next.profiles);
              setScale(next.scale);
            }}
          />
          {tally.models > 0 && <BudgetLines tally={tally} budget={budget} />}
        </div>
        <Refusal error={error} onDismiss={() => setError(null)} />
        <div className="dlg-foot">
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </>
  );
}
