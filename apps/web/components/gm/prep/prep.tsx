"use client";
import { useState, type FormEvent } from "react";

import type { ActionResult, BeatStatus, Codex, LiveState, Threat } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { BeatEditor } from "./components/beat-editor/beat-editor";
import type { Beat } from "./types";
import { stripBeat } from "./utils";

type PrepProps = { state: LiveState; codex: Codex; send: Send; bestiary: Threat[]; onRun: () => void };

export function Prep({ state, codex, send, bestiary, onRun }: PrepProps) {
  const [advId, setAdvId] = useState<string | null>(codex.adventures[0]?.id ?? null);
  const [editing, setEditing] = useState<Beat | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const adv = codex.adventures.find((a) => a.id === advId) ?? null;
  const players = state.characters.length;

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

  // RUN BEAT: puts the beat's prepared encounter live and jumps to the tracker.
  const runBeat = async (b: Beat) => {
    const r = await send({ type: "beat.startEncounter", id: b.id });
    report(r, "ENCOUNTER LIVE");
    if (r.ok) onRun();
  };

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "amber"}>{msg}</div>}
      <div className="keys">
        {codex.adventures.map((a) => (
          <button key={a.id} className={`btn ${a.id === advId ? "primary" : ""}`} onClick={() => pickAdventure(a.id)}>{a.title.toUpperCase()}</button>
        ))}
        <form style={{ display: "flex", gap: 6 }} onSubmit={handleCreateAdventure}>
          <input className="input" aria-label="New adventure title" placeholder="NEW ADVENTURE" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn" aria-label="Create adventure">+</button>
        </form>
      </div>

      {!adv && <p className="dim">Create an adventure, then plan its beats: briefing, travel, investigation, social, combat, revelation, rest.</p>}

      {adv && !editing && (
        <>
          <div className="rule">── {adv.title.toUpperCase()} · BEATS ──</div>
          <div className="list">
            {adv.beats.map((b, i) => (
              <div key={b.id} className="item">
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="dim">{String(i + 1).padStart(2, "0")}</span>
                  <b style={{ flex: 1 }}>{b.title.toUpperCase()}</b>
                  <span className="chip">{b.type.toUpperCase()}</span>
                  <span className={`chip ${b.status === "active" ? "warn" : ""}`}>{b.status.toUpperCase()}</span>
                </div>
                {b.readAloud && <pre className="text dim">{b.readAloud}</pre>}
                {b.encounter.length > 0 && <div className="dim">ENCOUNTER: {b.encounter.map((e) => `${e.label ?? e.threatId}${e.count > 1 ? ` ×${e.count}${e.asMob ? " (mob)" : ""}` : ""}`).join(", ")}</div>}
                <div className="keys">
                  <button className="btn sm" onClick={() => move({ index: i, dir: -1 })} aria-label={`Move ${b.title} up`}>↑</button>
                  <button className="btn sm" onClick={() => move({ index: i, dir: 1 })} aria-label={`Move ${b.title} down`}>↓</button>
                  <button className="btn sm" onClick={() => setEditing(b)}>EDIT</button>
                  {b.encounter.length > 0
                    ? <button className="btn sm primary" onClick={() => runBeat(b)}>RUN BEAT</button>
                    : <button className="btn sm" onClick={() => setStatus(b, "active")}>SET ACTIVE</button>}
                  <button className="btn sm" onClick={() => setStatus(b, "done")}>DONE</button>
                  <button className="btn sm" onClick={() => setStatus(b, "skipped")}>SKIP</button>
                </div>
              </div>
            ))}
          </div>
          <div><button className="btn primary" onClick={() => setEditing("new")}>+ NEW BEAT</button></div>
        </>
      )}

      {adv && editing && (
        <BeatEditor key={editing === "new" ? "new" : editing.id} adventureId={adv.id} beat={editing === "new" ? null : editing}
          codex={codex} players={players} send={send} bestiary={bestiary} onDone={() => setEditing(null)} />
      )}
    </div>
  );
}
