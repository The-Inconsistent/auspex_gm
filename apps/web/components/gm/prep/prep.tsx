"use client";
import { useState, type FormEvent } from "react";

import type { ActionResult, BeatStatus, Codex, LiveState, ScenePresets, Threat } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { BeatEditor } from "./components/beat-editor/beat-editor";
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
  onRun: () => void;
};

export function Prep({ state, codex, send, bestiary, presets, onRun }: PrepProps) {
  const [advId, setAdvId] = useState<string | null>(codex.adventures[0]?.id ?? null);
  // The scene editor (a scene, or "new"), or the book-table picker ("table").
  const [editing, setEditing] = useState<Beat | "new" | "table" | null>(null);
  const [title, setTitle] = useState("");
  const [advDraft, setAdvDraft] = useState<{ title: string; premise: string } | null>(null); // adventure being edited
  const [msg, setMsg] = useState<string | null>(null);
  const adv = codex.adventures.find((a) => a.id === advId) ?? null;
  const players = state.characters.length;

  // Names for a beat's location, NPCs and handouts; ids the codex no longer has are skipped.
  const links = (b: Beat) =>
    (
      [
        ["LOCATION", codex.locations.filter((l) => l.id === b.locationId).map((l) => l.name)],
        ["NPCS", codex.npcs.filter((n) => b.npcIds.includes(n.id)).map((n) => n.name)],
        ["HANDOUTS", codex.handouts.filter((h) => b.handoutIds.includes(h.id)).map((h) => h.title)],
      ] as const
    ).flatMap(([label, names]) => (names.length ? [[label, names.join(", ")] as const] : []));

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
    if (!title.trim()) return;
    const r = await send({ type: "codex.save", kind: "adventure", data: { title: title.trim() } });
    report(r, "ADVENTURE CREATED");
    if (r.ok && r.id) setAdvId(r.id);
    setTitle("");
  };

  // SAVE on the adventure: keeps its status (codex.save would reset it to the default) and closes the editor.
  const saveAdventure = async () => {
    if (!adv || !advDraft?.title.trim()) return;
    const r = await send({
      type: "codex.save",
      kind: "adventure",
      id: adv.id,
      data: { title: advDraft.title.trim(), premise: advDraft.premise, status: adv.status },
    });
    report(r, "ADVENTURE SAVED");
    if (r.ok) setAdvDraft(null);
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
            className="input"
            aria-label="New adventure title"
            placeholder="NEW ADVENTURE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn" aria-label="Create adventure">
            +
          </button>
        </form>
      </div>

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
                />
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
                <button className="btn sm" onClick={() => setAdvDraft({ title: adv.title, premise: adv.premise })}>
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
                    <span className="label accent">GOAL</span> <b>{b.goal}</b>
                  </div>
                )}
                {beatFields.map(([key, label, gmOnly]) =>
                  !b[key] ? null : gmOnly ? (
                    // Closed by default so a player glancing at the tablet doesn't read them.
                    <details key={key} className="field plate">
                      <summary className="label">{label} · TAP TO REVEAL</summary>
                      <pre className="text">{b[key]}</pre>
                    </details>
                  ) : (
                    <div key={key} className="field">
                      <span className="label">{label}</span>
                      <pre className="text">{b[key]}</pre>
                    </div>
                  ),
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
                {b.tests.length > 0 && <SceneTests tests={b.tests} />}
                {b.ruin.length + b.glory.length + b.spends.length > 0 && (
                  <ScenePools beat={b} pools={state.campaign} players={players} send={send} onReport={report} />
                )}
                {b.encounter.length > 0 && (
                  <div className="dim">
                    ENCOUNTER:{" "}
                    {b.encounter
                      .map(
                        (e) => `${e.label ?? e.threatId}${e.count > 1 ? ` ×${e.count}${e.asMob ? " (mob)" : ""}` : ""}`,
                      )
                      .join(", ")}
                  </div>
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
          players={players}
          send={send}
          bestiary={bestiary}
          skillDns={presets.skillDns}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}
