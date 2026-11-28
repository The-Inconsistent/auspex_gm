"use client";
import { useRef, useState, type ChangeEvent } from "react";

import {
  activeCharacterIds,
  agentsInFight,
  encounterBudget,
  isOut,
  Marker,
  tallyByClass,
  type Codex,
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
import {
  budgetEntries,
  FIGHTS_AS_HINT,
  FIGHTS_AS_LABEL,
  followersToAdd,
  joinRules,
  npcStats,
  pickDefaults,
  runByOptions,
  type Npc,
} from "@/lib/ally/ally";
import { fold } from "@/lib/fold/fold";

import type { Run } from "../../types";
import { ADD_MODES, JOIN_SIDES, NO_STATS_HINT, type AddMode, type JoinSide } from "./constants";

type AddCombatantsProps = { state: LiveState; codex: Codex; run: Run; bestiary: Threat[] };

// ADD TO FIGHT: one button under the table, the picker, scaling and the Building Encounters check in a native modal
// <dialog> (Escape, focus trap, backdrop, as Legend does). It stays open after ADD: reinforcements come several at once.
// Three ways in (issue #350): a stat block from the bestiary, a Codex NPC (its category and who it follows come along),
// and + FOLLOWERS (the NPCs given to the Agents in the fight). A threat joins as an enemy or, on the Agents' side, as an
// ally run by the GM or by an Agent's player.
export function AddCombatants({ state, codex, run, bestiary }: AddCombatantsProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // The tracker's error line sits behind the modal, so a refused ADD shows its reason in here.
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AddMode>("bestiary");
  const [threatId, setThreatId] = useState("");
  const [mob, setMob] = useState("");
  const [marker, setMarker] = useState<Marker | null>(null);
  // Kept between adds, like the marker: a GM placing reinforcements adds several hidden in a row.
  const [visibility, setVisibility] = useState<Visibility>("bars");
  // Profiles (VoA p.126) and scaling (Core p.326) reset with the picker, so the next threat starts from its stat block.
  const [profiles, setProfiles] = useState<ProfileId[]>([]);
  const [scale, setScale] = useState(false);
  // Which side it joins and who runs it (null: the GM). Kept between adds, like the marker.
  const [side, setSide] = useState<JoinSide>("enemy");
  const [runBy, setRunBy] = useState<string | null>(null);
  const [npcId, setNpcId] = useState("");
  const [find, setFind] = useState("");
  const inFight = new Set(state.encounter?.combatants.flatMap((c) => (c.kind === "pc" ? [c.characterId] : [])));
  const active = activeCharacterIds(state.access); // reserve Agents stay out of the fight
  const missing = state.characters.filter((c) => active.has(c.id) && !inFight.has(c.id));
  const fighting = state.characters.filter((c) => inFight.has(c.id));
  const threat = bestiary.find((x) => x.id === threatId);
  const mobCount = Number(mob);
  const npc = mode === "codex" ? codex.npcs.find((n) => n.id === npcId) : undefined;
  const npcThreat = npc ? npcStats({ npc, bestiary }) : null;
  const rules = npc ? joinRules(npc) : null;
  // The fight as it stands, against the same guideline STORY uses (Threat Assessment p.8). The class was resolved when
  // each threat joined, and a Mob's models are the members still standing. Anything out of the fight (`isOut`: a slain
  // threat, a dead Agent) has stopped being something to keep track of, so it leaves the tally even while its row waits
  // for the GM to remove it. Allies stay off it (§11.208).
  const standing = (state.encounter?.combatants ?? []).filter((c) => !isOut(state, c));
  const tally = tallyByClass(budgetEntries(standing));
  // Sized for the Agents in the fight, falling back to the seated ones before + PARTY, as STORY does: a budget of 0
  // Troops would read OVER against the first threat the GM places.
  const agents = standing.filter((c) => c.kind === "pc").length || agentsInFight(state);
  const budget = encounterBudget({ agents });
  // The scaling preview counts the seated Agents, which is what the server scales by (claimedCharacterIds, §11.106),
  // not the rows already placed.
  const seated = agentsInFight(state);
  const runOptions = runByOptions({
    agents: fighting.map((c) => ({ id: c.id, name: c.name })),
    fightsAs: npc?.fightsAs ?? null,
  });
  const followers = followersToAdd({
    codex,
    bestiary,
    agentIds: fighting.map((c) => c.id),
    combatants: state.encounter?.combatants ?? [],
  });
  const listed = codex.npcs.filter((n) => !find || fold(n.name).includes(fold(find)));

  // Mob size: digits only.
  const handleMobChange = (e: ChangeEvent<HTMLInputElement>) => setMob(e.target.value.replace(/\D/g, ""));

  // Marker picker: the empty option clears it.
  const handleMarkerChange = (e: ChangeEvent<HTMLSelectElement>) =>
    setMarker(Marker.safeParse(e.target.value).data ?? null);

  // A Codex NPC: its category sets what is offered, and the Agent it follows runs it by default (an Ally: the GM).
  const handleNpcPick = (n: Npc) => {
    const d = pickDefaults(
      n,
      fighting.map((c) => c.id),
    );
    setNpcId(n.id);
    setSide(d.side);
    setRunBy(d.runBy);
  };

  // Each way in starts from the default: an enemy run by the GM, no NPC picked. A follower picked in CODEX would otherwise
  // leave JOINS on ally (and its NPC behind), and the next Ork Boy from the bestiary would join the Agents' side.
  const handleModeChange = (m: AddMode) => {
    setMode(m);
    setSide("enemy");
    setRunBy(null);
    setNpcId("");
    setFind("");
  };

  // JOINS: the empty enemy choice is the old behaviour; an ally keeps its runner.
  const ally = side === "ally" || (!!rules && !rules.enemy);

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
        ally,
        controllerId: ally ? runBy : null,
      },
      `+ ${threat.name.toUpperCase()}${isMob ? ` ×${mob}` : ""}${ally ? " (ALLY)" : ""}`,
    );
    if (!res.ok) return setError(res.error); // keep the picks, so the GM can fix one and ADD again
    setMob("");
    setThreatId("");
    setProfiles([]);
    setScale(false);
  };

  // ADD (from CODEX): the NPC joins under its own name, with its category checked again by the server.
  const handleAddNpc = async () => {
    if (!npc || !npcThreat) return;
    const res = await run(
      {
        type: "combatant.addThreat",
        threatId: npcThreat.id,
        label: npc.name,
        npcId: npc.id,
        ...(marker ? { marker } : {}),
        ...(ally ? {} : { visibility }),
        ally,
        controllerId: ally ? runBy : null,
      },
      `+ ${npc.name.toUpperCase()}${ally ? " (ALLY)" : ""}`,
    );
    if (!res.ok) return setError(res.error);
    setNpcId("");
  };

  // + FOLLOWERS: each given NPC of an Agent in the fight joins as an ally that Agent's player runs.
  const handleAddFollowers = async () => {
    for (const { npc: n, threat: t } of followers.add) {
      const res = await run(
        {
          type: "combatant.addThreat",
          threatId: t.id,
          label: n.name,
          npcId: n.id,
          ally: true,
          controllerId: n.fightsAs === "ally" ? null : n.followsId,
        },
        `+ ${n.name.toUpperCase()} (FOLLOWER)`,
      );
      if (!res.ok) return setError(res.error);
    }
  };

  // + PARTY: adds every character not yet in the fight, in order.
  const handleAddParty = async () => {
    for (const c of missing) {
      const res = await run({ type: "combatant.addCharacter", characterId: c.id }, `+ ${c.name.toUpperCase()}`);
      if (!res.ok) return setError(res.error);
    }
  };

  // JOINS and RUN BY: two short choices that apply to either way in.
  const sideChoices = (
    <>
      <div className="keys">
        <span className="label">JOINS</span>
        <div className="fight-seg" role="group" aria-label="Which side it joins">
          {(Object.keys(JOIN_SIDES) as JoinSide[]).map((s) => (
            <button
              key={s}
              type="button"
              className={s === "ally" ? "ally" : undefined}
              aria-pressed={(s === "ally") === ally}
              disabled={s === "enemy" && !!rules && !rules.enemy}
              onClick={() => setSide(s)}
            >
              {JOIN_SIDES[s]}
            </button>
          ))}
        </div>
      </div>
      {ally && (
        <div className="keys">
          <span className="label">RUN BY</span>
          <div className="fight-seg ally" role="group" aria-label="Who runs it">
            {runOptions.map((o) => (
              <button key={o.id ?? "gm"} type="button" aria-pressed={o.id === runBy} onClick={() => setRunBy(o.id)}>
                {o.name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      {rules && !rules.enemy && (
        <span className="dim">
          A {FIGHTS_AS_LABEL[npc!.fightsAs].toLowerCase()} never fights against the Agents. Change its category in CODEX
          if the story turns it.
        </span>
      )}
      {rules && !rules.playerMayRun && <span className="dim">An Ally: only the GM runs it.</span>}
    </>
  );

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
            <div className="fight-seg" role="group" aria-label="Add from">
              {(Object.keys(ADD_MODES) as AddMode[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => handleModeChange(m)}>
                  {ADD_MODES[m]}
                </button>
              ))}
            </div>
            {missing.length > 0 && (
              <button className="btn" onClick={handleAddParty}>
                + PARTY ({missing.length})
              </button>
            )}
          </div>

          {mode === "bestiary" && (
            <>
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
                {!ally && <VisibilitySelect value={visibility} onChange={setVisibility} />}
              </div>
              {sideChoices}
              <div className="keys">
                <button className="btn" disabled={!threat} onClick={handleAdd}>
                  ADD{ally ? " AS AN ALLY" : ""}
                </button>
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
            </>
          )}

          {mode === "codex" && (
            <>
              <input
                className="input"
                aria-label="Find an NPC"
                placeholder="FIND AN NPC"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              <div className="stack" style={{ gap: 4 }}>
                {listed.length === 0 && <span className="dim">No NPC in the Codex matches.</span>}
                {listed.map((n) => {
                  const stats = npcStats({ npc: n, bestiary });
                  const follows = state.characters.find((c) => c.id === n.followsId)?.name;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className="btn vis-pick"
                      aria-pressed={n.id === npcId}
                      onClick={() => handleNpcPick(n)}
                    >
                      <b>{n.name}</b>
                      <span className="dim">{stats ? `${stats.name} · ${stats.source}` : NO_STATS_HINT}</span>
                      <span className="chip ally">{FIGHTS_AS_LABEL[n.fightsAs]}</span>
                      {follows && <span className="chip ally">FOLLOWS {follows.toUpperCase()}</span>}
                    </button>
                  );
                })}
              </div>
              {npc && (
                <>
                  <span className="dim">{FIGHTS_AS_HINT[npc.fightsAs]}</span>
                  {sideChoices}
                  <div className="keys">
                    <select
                      className="btn"
                      aria-label="Marker colour"
                      value={marker ?? ""}
                      onChange={handleMarkerChange}
                    >
                      <option value="">MARKER</option>
                      {Marker.options.map((m) => (
                        <option key={m} value={m}>
                          {m.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {!ally && <VisibilitySelect value={visibility} onChange={setVisibility} />}
                    <button className="btn" disabled={!npcThreat} onClick={handleAddNpc}>
                      ADD {npc.name.toUpperCase()}
                      {ally ? " AS AN ALLY" : ""}
                    </button>
                  </div>
                  {!npcThreat && <span className="red">{NO_STATS_HINT}</span>}
                </>
              )}
            </>
          )}

          {mode === "followers" && (
            <>
              {followers.add.length === 0 && followers.noStats.length === 0 && (
                <span className="dim">
                  {followers.fielded > 0
                    ? "Every follower given to an Agent in this fight is already in it."
                    : "No NPC is given to an Agent in this fight (GIVE one in CODEX, IN THIS SCENE or STORY)."}
                </span>
              )}
              {followers.add.map(({ npc: n }) => (
                <span key={n.id}>
                  <b>{n.name}</b>{" "}
                  <span className="dim">
                    follows {state.characters.find((c) => c.id === n.followsId)?.name ?? "an Agent"}
                    {n.fightsAs === "ally" ? ", run by the GM" : ", run by that player"}
                  </span>
                </span>
              ))}
              {followers.noStats.length > 0 && (
                <span className="dim">Without a stat block, not added: {followers.noStats.join(", ")}.</span>
              )}
              <div className="keys">
                <button className="btn" disabled={followers.add.length === 0} onClick={handleAddFollowers}>
                  ADD {followers.add.length} {followers.add.length === 1 ? "FOLLOWER" : "FOLLOWERS"}
                </button>
              </div>
            </>
          )}

          {tally.models > 0 && <BudgetLines tally={tally} budget={budget} />}
          {tally.models > 0 && standing.some((c) => c.kind === "threat" && c.ally) && (
            <span className="dim">
              Allies stay off these lines: they are not the opposition (Threat Assessment p.8).
            </span>
          )}
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
