"use client";
import { useMemo, useState, type FormEvent } from "react";

import {
  agentsInFight,
  CodexSave,
  threatProfile,
  type ActionResult,
  type BeatStatus,
  type Codex,
  type LiveState,
  type ScenePresets,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { holderOf, ItemGive } from "@/components/ui/item-give/item-give";
import { Mentions } from "@/components/ui/mentions/mentions";
import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";
import { fieldedAgentIds } from "@/lib/print-cards/print-cards";

import { BeatEditor } from "./components/beat-editor/beat-editor";
import { SceneHazards } from "./components/scene-hazards/scene-hazards";
import { ScenePicker } from "./components/scene-picker/scene-picker";
import { ScenePools } from "./components/scene-pools/scene-pools";
import { SceneTests } from "./components/scene-tests/scene-tests";
import type { Beat } from "./types";
import { sceneNumber, stripBeat } from "./utils";

// What PREP shows under each beat; GM notes sit on the plate like the codex's GM-only fields.
const beatFields = [
  ["readAloud", "READ ALOUD", false],
  ["gmNotes", "GM NOTES · WHAT'S REALLY GOING ON", true],
  ["outcome", "OUTCOME", false],
] as const;

type PrepProps = {
  state: LiveState;
  codex: Codex;
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  wargear: Wargear[]; // for a scene's + NEW CUSTOM THREAT
  onRun: () => void;
};

export function Prep({ state, codex, send, bestiary, presets, wargear, onRun }: PrepProps) {
  const [advId, setAdvId] = useState<string | null>(codex.adventures[0]?.id ?? null);
  // The scene editor (a scene, or "new"), or the book-table picker ("table").
  const [editing, setEditing] = useState<Beat | "new" | "table" | null>(null);
  const [title, setTitle] = useState("");
  const [advDraft, setAdvDraft] = useState<{ title: string; premise: string } | null>(null); // adventure being edited
  const [msg, setMsg] = useState<string | null>(null);
  const newFields = useFieldErrors("adv-new"); // the new adventure's title
  const advFields = useFieldErrors("adv-"); // the open adventure's
  const adv = codex.adventures.find((a) => a.id === advId) ?? null;
  const players = state.characters.length; // the pool maxima count every Agent (`poolMax`, Core pp.164, 320)
  // Only active Agents join a fight (`beat.startEncounter` adds those), so they are who the encounter budget is for
  // and whose number scales a Threat (Core p.326, §11.106).
  const agents = agentsInFight(state);
  const { print } = usePrint();
  // Names for the ENCOUNTER line, so a scene card reads "Ork Boy" and not "ork-boy".
  const threatNames = useMemo(() => new Map(bestiary.map((t) => [t.id, t.name])), [bestiary]);

  // One entry on the scene card, with what the GM ticked on it: the profiles by name and "scaled" (VoA p.126,
  // Core p.326), so the card says why this fight's numbers won't match the book.
  const encounterLine = (e: Beat["encounter"][number]) => {
    const extras = [...e.profiles.map((p) => threatProfile(p).name.toLowerCase()), ...(e.scale ? ["scaled"] : [])];
    return `${e.label ?? threatNames.get(e.threatId) ?? e.threatId}${
      e.count > 1 ? ` ×${e.count}${e.asMob ? " (mob)" : ""}` : ""
    }${extras.length ? ` · ${extras.join(", ")}` : ""}`;
  };

  // Names for a beat's location, NPCs and handouts; ids the codex no longer has are skipped.
  const links = (b: Beat) =>
    (
      [
        ["LOCATION", codex.locations.filter((l) => l.id === b.locationId).map((l) => l.name)],
        ["NPCS", codex.npcs.filter((n) => b.npcIds.includes(n.id)).map((n) => n.name)],
        ["HANDOUTS", codex.handouts.filter((h) => b.handoutIds.includes(h.id)).map((h) => h.title)],
      ] as const
    ).flatMap(([label, names]) => (names.length ? [[label, names.join(", ")] as const] : []));

  // A beat's place, for its hazards (issue #49).
  const place = (b: Beat) => codex.locations.find((l) => l.id === b.locationId);

  // Where an exit leads, as the card numbers it; null when it has no target, or one the codex no longer has.
  const exitTarget = (beatId: string | null) => {
    const i = adv?.beats.findIndex((x) => x.id === beatId) ?? -1;
    const to = adv?.beats[i];
    return to ? `${sceneNumber(i)} · ${to.title.toUpperCase()}` : null;
  };

  const report = (r: ActionResult, ok: string) => setMsg(r.ok ? ok : `! ${r.error}`);

  // ↑ / ↓: swaps a beat with its neighbour and saves the new order.
  const move = async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
    if (!adv) return;
    const ids = adv.beats.map((b) => b.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    const r = await send({ type: "beat.reorder", adventureId: adv.id, ids });
    if (!r.ok) setMsg(`! ${r.error}`);
  };

  // SET ACTIVE / DONE / SKIP: saves the beat with its new status.
  const setStatus = async (b: Beat, status: BeatStatus) => {
    const r = await send({ type: "codex.save", kind: "beat", id: b.id, data: { ...stripBeat(b), status } });
    report(r, `${b.title.toUpperCase()} → ${status.toUpperCase()}`);
  };

  // Adventure tab: switch adventure and close any open beat editor.
  const pickAdventure = (id: string) => {
    setAdvId(id);
    setEditing(null);
    setAdvDraft(null);
  };

  // New adventure form: creates it and switches to it.
  const handleCreateAdventure = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const named = newFields.check(CodexSave.adventure.shape.title, title);
    if (named === null) return;
    const r = await send({ type: "codex.save", kind: "adventure", data: { title: named } });
    report(r, "ADVENTURE CREATED");
    if (r.ok && r.id) setAdvId(r.id);
    setTitle("");
  };

  // SAVE on the adventure: keeps its status (codex.save would reset it to the default) and closes the editor.
  const saveAdventure = async () => {
    if (!adv || !advDraft) return;
    const data = advFields.check(CodexSave.adventure, { ...advDraft, status: adv.status });
    if (!data) return;
    const r = await send({ type: "codex.save", kind: "adventure", id: adv.id, data });
    report(r, "ADVENTURE SAVED");
    if (r.ok) setAdvDraft(null);
  };

  // EDIT on the adventure: its title and premise, with no marks left from an earlier SAVE.
  const editAdventure = (a: { title: string; premise: string }) => {
    advFields.reset();
    setAdvDraft({ title: a.title, premise: a.premise });
  };

  // RUN SCENE: puts the beat's prepared encounter live and jumps to the tracker.
  const runBeat = async (b: Beat) => {
    const r = await send({ type: "beat.startEncounter", id: b.id });
    report(r, "ENCOUNTER LIVE");
    if (r.ok) onRun();
  };

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}
      <div className="keys">
        {codex.adventures.map((a) => (
          <button key={a.id} className={`btn ${a.id === advId ? "primary" : ""}`} onClick={() => pickAdventure(a.id)}>
            {a.title.toUpperCase()}
          </button>
        ))}
        <form style={{ display: "flex", gap: 6 }} onSubmit={handleCreateAdventure}>
          <input
            id="adv-new"
            className="input"
            aria-label="New adventure title"
            placeholder="NEW ADVENTURE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...newFields.marks()}
          />
          <button className="btn" aria-label="Create adventure">
            +
          </button>
        </form>
      </div>
      <FieldError {...newFields.reason()} />

      {!adv && (
        <p className="dim">
          Create an adventure, then plan its scenes: briefing, travel, investigation, social, combat, revelation, rest.
        </p>
      )}

      {adv && !editing && (
        <>
          {advDraft ? (
            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="adv-title">
                  TITLE
                </label>
                <input
                  id="adv-title"
                  className="input"
                  value={advDraft.title}
                  onChange={(e) => setAdvDraft({ ...advDraft, title: e.target.value })}
                  {...advFields.marks("title")}
                />
                <FieldError {...advFields.reason("title")} />
              </div>
              <div className="field">
                <label className="label" htmlFor="adv-premise">
                  PREMISE / GM NOTES
                </label>
                <textarea
                  id="adv-premise"
                  className="input"
                  value={advDraft.premise}
                  onChange={(e) => setAdvDraft({ ...advDraft, premise: e.target.value })}
                />
              </div>
              <div className="keys">
                <button className="btn sm primary" onClick={saveAdventure}>
                  SAVE
                </button>
                <button className="btn sm" onClick={() => setAdvDraft(null)}>
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* The premise holds the hidden truth, so it stays closed like the beats' GM notes. */}
              {adv.premise && (
                <details className="field plate">
                  <summary className="label">PREMISE · TAP TO REVEAL</summary>
                  <pre className="text">{adv.premise}</pre>
                </details>
              )}
              <div>
                <button className="btn sm" onClick={() => editAdventure(adv)}>
                  EDIT ADVENTURE
                </button>
              </div>
            </>
          )}
          <div className="rule">{adv.title.toUpperCase()} · SCENES</div>
          <div className="list">
            {adv.beats.map((b, i) => (
              <div key={b.id} className="item">
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="dim">{sceneNumber(i)}</span>
                  <b style={{ flex: 1 }}>{b.title.toUpperCase()}</b>
                  <span className="chip">{b.type.toUpperCase()}</span>
                  <span className={`chip ${b.status === "active" ? "warn" : ""}`}>{b.status.toUpperCase()}</span>
                </div>
                {b.goal && (
                  <div>
                    <span className="label accent">GOAL</span>{" "}
                    <b>
                      <Mentions text={b.goal} self={b.id} />
                    </b>
                  </div>
                )}
                {beatFields.map(([key, label, gmOnly]) =>
                  !b[key] ? null : gmOnly ? (
                    // Closed by default so a player glancing at the tablet doesn't read them.
                    <details key={key} className="field plate">
                      <summary className="label">{label} · TAP TO REVEAL</summary>
                      <pre className="text">
                        <Mentions text={b[key]} self={b.id} />
                      </pre>
                    </details>
                  ) : (
                    <div key={key} className="field">
                      <span className="label">{label}</span>
                      <pre className="text">
                        <Mentions text={b[key]} self={b.id} />
                      </pre>
                    </div>
                  ),
                )}
                {place(b) && (
                  <SceneHazards
                    beat={b}
                    place={place(b)!}
                    tables={presets.hazards}
                    bestiary={bestiary}
                    tier={state.campaign.tier}
                    send={send}
                    onReport={report}
                  />
                )}
                {b.exits.length > 0 && (
                  <div className="field">
                    <span className="label">EXITS</span>
                    {b.exits.map((e, j) => {
                      const to = exitTarget(e.beatId);
                      return (
                        <div key={j} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <i style={{ flex: 1 }}>{e.label}</i>
                          <b className={to ? "" : "dim"}>→ {to ?? "NO SCENE YET"}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
                {links(b).map(([label, names]) => (
                  <div key={label} className="dim">
                    {label}: {names}
                  </div>
                ))}
                {codex.items.some((it) => b.itemIds.includes(it.id)) && (
                  <div className="field">
                    <span className="label">ITEMS TO FIND</span>
                    {codex.items
                      .filter((it) => b.itemIds.includes(it.id))
                      .map((it) => {
                        const holder = holderOf(it, { codex, characters: state.characters });
                        return (
                          <div key={it.id} className="keys" style={{ padding: 0, alignItems: "center" }}>
                            <b style={{ flex: 1 }}>{it.name.toUpperCase()}</b>
                            <span className="dim">
                              {holder.label} {holder.name}
                            </span>
                            <ItemGive
                              item={it}
                              characters={state.characters}
                              send={send}
                              onError={(e) => setMsg(e && `! ${e}`)}
                            />
                          </div>
                        );
                      })}
                  </div>
                )}
                {b.tests.length > 0 && <SceneTests tests={b.tests} />}
                {b.ruin.length + b.glory.length + b.spends.length > 0 && (
                  <ScenePools beat={b} pools={state.campaign} players={players} send={send} onReport={report} />
                )}
                {b.encounter.length > 0 && (
                  <div className="dim">ENCOUNTER: {b.encounter.map(encounterLine).join(", ")}</div>
                )}
                <div className="keys">
                  <button
                    className="btn sm"
                    onClick={() => move({ index: i, dir: -1 })}
                    aria-label={`Move ${b.title} up`}
                  >
                    ↑
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => move({ index: i, dir: 1 })}
                    aria-label={`Move ${b.title} down`}
                  >
                    ↓
                  </button>
                  <button className="btn sm" onClick={() => setEditing(b)}>
                    EDIT
                  </button>
                  {b.encounter.length > 0 ? (
                    <button className="btn sm primary" onClick={() => runBeat(b)}>
                      RUN SCENE
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => setStatus(b, "active")}>
                      SET ACTIVE
                    </button>
                  )}
                  <button className="btn sm" onClick={() => setStatus(b, "done")}>
                    DONE
                  </button>
                  <button className="btn sm" onClick={() => setStatus(b, "skipped")}>
                    SKIP
                  </button>
                  {/* Tents for the Agents and every prepared combatant, Threat cards, and the scene's items (#203). */}
                  <button
                    className="btn sm"
                    onClick={() => print({ agents: fieldedAgentIds(state), encounter: b.encounter, items: b.itemIds })}
                  >
                    PRINT CARDS
                  </button>
                  {/* The scene's handouts as printed props, one to a page (#204). */}
                  {b.handoutIds.length > 0 && (
                    <button className="btn sm" onClick={() => print({ handouts: b.handoutIds })}>
                      PRINT HANDOUTS
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="keys">
            <button className="btn primary" onClick={() => setEditing("new")}>
              + NEW SCENE
            </button>
            {presets.tables.length > 0 && (
              <button className="btn" onClick={() => setEditing("table")}>
                + SCENE FROM A TABLE
              </button>
            )}
          </div>
        </>
      )}

      {adv && editing === "table" && (
        <ScenePicker
          adventureId={adv.id}
          tables={presets.tables}
          send={send}
          onDone={(done) => {
            setEditing(null);
            if (done) setMsg(done);
          }}
        />
      )}

      {adv && editing && editing !== "table" && (
        <BeatEditor
          key={editing === "new" ? "new" : editing.id}
          adventureId={adv.id}
          beat={editing === "new" ? null : editing}
          codex={codex}
          agents={agents}
          tier={state.campaign.tier}
          send={send}
          bestiary={bestiary}
          skillDns={presets.skillDns}
          poolTables={presets.pools}
          hazardTables={presets.hazards}
          wargear={wargear}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}
