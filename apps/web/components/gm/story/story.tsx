"use client";
import { useMemo, useState } from "react";

import type { ActionResult, BeatStatus, Codex, LiveState, ScenePresets, Threat, Wargear } from "@wg/shared";
import { agentsInFight } from "@wg/shared";

import { BeatEditor } from "@/components/gm/prep/components/beat-editor/beat-editor";
import { ScenePicker } from "@/components/gm/prep/components/scene-picker/scene-picker";
import { stripBeat } from "@/components/gm/prep/utils";
import type { Send } from "@/hooks/use-table/use-table";
import { currentScene } from "@/lib/scene/scene";

import { AdventureBar } from "./components/adventure-bar/adventure-bar";
import { SceneBoard } from "./components/scene-board/scene-board";
import { ScenePage } from "./components/scene-page/scene-page";
import { STORY_VIEWS, type StoryView } from "./constants";
import type { Editing } from "./types";

type StoryProps = {
  state: LiveState;
  codex: Codex;
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  wargear: Wargear[]; // for a scene's + NEW CUSTOM THREAT
  onRun: () => void; // a scene has begun: the lead switches to SCENE
  initialSceneId?: string; // a peek's GO TO (issue #198): open on that scene's page
};

// STORY: prep as a storyboard you flip scene by scene. BOARD hangs the adventure's scenes on a spine; PAGE opens one as a
// book spread. Everything PREP did is reachable from here.
export function Story({ state, codex, send, bestiary, presets, wargear, onRun, initialSceneId }: StoryProps) {
  // A GO TO opens that scene's page; otherwise STORY opens on the scene being played, in its adventure.
  const startId = initialSceneId ?? currentScene(codex)?.beat.id;
  const opened = codex.adventures.find((a) => a.beats.some((b) => b.id === startId));
  const [advId, setAdvId] = useState<string | null>(() => opened?.id ?? codex.adventures[0]?.id ?? null);
  const [sceneId, setSceneId] = useState<string | null>(startId ?? null);
  const [view, setView] = useState<StoryView>(initialSceneId && opened ? "page" : "board");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const adv = codex.adventures.find((a) => a.id === advId) ?? null;
  // The open scene: the one asked for, else the first (a deleted or never-picked scene).
  const found = adv?.beats.findIndex((b) => b.id === sceneId) ?? -1;
  const index = found >= 0 ? found : 0;
  const scene = adv?.beats[index] ?? null;
  // Only active Agents join a fight (`beat.startEncounter` adds those), so they are who the encounter budget is for
  // and whose number scales a Threat (Core p.326, §11.106).
  const agents = agentsInFight(state);
  // Names for the fight lines, so a card reads "Ork Boy" and not "ork-boy".
  const threatNames = useMemo(() => new Map(bestiary.map((t) => [t.id, t.name])), [bestiary]);

  const report = (r: ActionResult, ok: string) =>
    setMsg(r.ok ? [ok, ...(r.notices ?? [])].join(" · ") : `! ${r.error}`); // notices: a Mutation Test owed

  // A scene card or tab: opens that scene's page.
  const openScene = (id: string) => {
    setSceneId(id);
    setView("page");
  };

  // The ScenePicker is done: close it and show what it made.
  const donePicking = (done: string) => {
    setEditing(null);
    if (done) setMsg(done);
  };

  // Adventure tab: switch adventure, back to its board, and close any open editor.
  const pickAdventure = (id: string) => {
    setAdvId(id);
    setSceneId(null);
    setView("board");
    setEditing(null);
  };

  // ↑ / ↓: swaps the scene with its neighbour and saves the new order.
  const move = async (dir: -1 | 1) => {
    if (!adv) return;
    const ids = adv.beats.map((b) => b.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    const r = await send({ type: "beat.reorder", adventureId: adv.id, ids });
    if (!r.ok) setMsg(`! ${r.error}`);
  };

  // DONE / SKIP: saves the scene with its new status. Only beat.begin may make a scene active.
  const setStatus = async (status: BeatStatus) => {
    if (!scene) return;
    const r = await send({ type: "codex.save", kind: "beat", id: scene.id, data: { ...stripBeat(scene), status } });
    report(r, `${scene.title.toUpperCase()} → ${status.toUpperCase()}`);
  };

  // ▶ RUN THIS SCENE: begins it (the scene left goes to DONE and this scene's ON ENTRY picks reach the phones), then
  // the lead switches to SCENE.
  const run = async () => {
    if (!scene) return;
    const r = await send({ type: "beat.begin", id: scene.id });
    report(
      r,
      `${scene.title.toUpperCase()} BEGUN${r.ok && r.revealed?.length ? ` · ${r.revealed.length} REVEALED` : ""}`,
    );
    if (r.ok) onRun();
  };

  const newScenes = (
    <div className="keys">
      <button className="btn primary" onClick={() => setEditing({ mode: "new" })}>
        + NEW SCENE
      </button>
      {presets.tables.length > 0 && (
        <button className="btn" onClick={() => setEditing({ mode: "table" })}>
          + SCENE FROM A TABLE
        </button>
      )}
    </div>
  );

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}

      {!editing && <AdventureBar codex={codex} adv={adv} send={send} onPick={pickAdventure} onReport={report} />}

      {adv && !editing && (
        <>
          <div className="story-bar">
            <div className="rule">{adv.title.toUpperCase()} · SCENES</div>
            <div className="keys" role="group" aria-label="View" style={{ padding: 0, flexWrap: "nowrap" }}>
              {(Object.keys(STORY_VIEWS) as StoryView[]).map((v) => (
                <button
                  key={v}
                  className={`btn ${view === v ? "primary" : ""}`}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {STORY_VIEWS[v]}
                </button>
              ))}
            </div>
          </div>
          {view === "board" && (
            <>
              <SceneBoard adv={adv} codex={codex} threatNames={threatNames} onOpen={openScene} />
              {newScenes}
            </>
          )}
          {view === "page" &&
            (scene ? (
              <ScenePage
                key={scene.id} // a new scene starts with GM NOTES and the hazards folded closed
                state={state}
                codex={codex}
                adv={adv}
                index={index}
                send={send}
                bestiary={bestiary}
                presets={presets}
                threatNames={threatNames}
                onOpen={setSceneId}
                onEdit={(section) => setEditing({ mode: "scene", section })}
                onRun={run}
                onMove={move}
                onStatus={setStatus}
                onReport={report}
                onError={(e) => setMsg(e && `! ${e}`)}
              />
            ) : (
              <>
                <p className="dim">No scenes yet. Add one.</p>
                {newScenes}
              </>
            ))}
        </>
      )}

      {adv && editing?.mode === "table" && (
        <ScenePicker adventureId={adv.id} tables={presets.tables} send={send} onDone={donePicking} />
      )}

      {adv && (editing?.mode === "new" || (editing?.mode === "scene" && scene)) && (
        <BeatEditor
          key={editing.mode === "scene" ? `${scene?.id}-${editing.section ?? "all"}` : "new"}
          adventureId={adv.id}
          beat={editing.mode === "scene" ? scene : null}
          section={editing.mode === "scene" ? editing.section : undefined}
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
