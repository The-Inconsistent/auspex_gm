"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ActionResult, BeatStatus, Codex, LiveState, ScenePresets, Threat, Wargear } from "@wg/shared";
import { agentsInFight } from "@wg/shared";

import { BeatEditor } from "@/components/gm/prep/components/beat-editor/beat-editor";
import type { BeatSection } from "@/components/gm/prep/components/beat-editor/constants";
import { ScenePicker } from "@/components/gm/prep/components/scene-picker/scene-picker";
import { stripBeat } from "@/components/gm/prep/utils";
import type { Send } from "@/hooks/use-table/use-table";
import { gmPath, type NewScene } from "@/lib/gm-path/gm-path";
import { currentScene } from "@/lib/scene/scene";
import type { Begun } from "@/lib/scene-reveal/scene-reveal";

import { AdventureBar } from "./components/adventure-bar/adventure-bar";
import { ImportAdventure } from "./components/import-adventure/import-adventure";
import { SceneBoard } from "./components/scene-board/scene-board";
import { ScenePage } from "./components/scene-page/scene-page";
import { STORY_VIEWS, type StoryView } from "./constants";
import type { Adventure, Editing } from "./types";

type StoryProps = {
  state: LiveState;
  codex: Codex;
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  wargear: Wargear[]; // for a scene's + NEW CUSTOM THREAT
  onRun: (begun: Begun | null) => void; // a scene has begun: the shell keeps its UNDO and switches to SCENE
  // From the URL (/story/<adventure>/<scene>/edit/<section>): none of them is the board of the default adventure.
  adventureId?: string;
  sceneId?: string; // its page, else the adventure's board
  editing?: Editing; // what replaces the spread
};

// STORY: prep as a storyboard you flip scene by scene. BOARD hangs the adventure's scenes on a spine; PAGE opens one as a
// book spread. Everything PREP did is reachable from here, and every view and editor has a URL, so every button here
// navigates.
export function Story({
  state,
  codex,
  send,
  bestiary,
  presets,
  wargear,
  onRun,
  adventureId,
  sceneId,
  editing,
}: StoryProps) {
  const router = useRouter();
  const campaignId = state.campaign.id;
  // With no adventure in the URL, STORY opens on the scene being played, in its adventure.
  const playing = currentScene(codex);
  const adv =
    (adventureId ? codex.adventures.find((a) => a.id === adventureId) : (playing?.adventure ?? codex.adventures[0])) ??
    null;
  const found = sceneId ? (adv?.beats.findIndex((b) => b.id === sceneId) ?? -1) : -1;
  const index = Math.max(found, 0);
  const scene = found >= 0 ? adv!.beats[found]! : null; // found in adv just above
  const view: StoryView = sceneId ? "page" : "board";
  // The board's highlighted scene (RUN FROM HERE runs it, PAGE opens it): the last one tapped or opened, else the one
  // being played, else the first. A scene opened by URL (GO TO, ‹ ›) becomes it, while rendering, so BOARD then PAGE
  // comes back to the same scene.
  const [selected, setSelected] = useState(sceneId ?? playing?.beat.id ?? null);
  const [shownId, setShownId] = useState(sceneId);
  if (sceneId !== shownId) {
    setShownId(sceneId);
    if (sceneId) setSelected(sceneId);
  }
  const selectedId = adv?.beats.find((b) => b.id === selected)?.id ?? adv?.beats[0]?.id ?? null;
  const [msg, setMsg] = useState<string | null>(null);
  // A link to an adventure or a scene that's gone (deleted, or another campaign's): back to the board above it.
  const lost = (!!adventureId && !adv) || (!!sceneId && !scene);
  // External system: the browser's URL, through Next's router.
  useEffect(() => {
    if (lost) router.replace(gmPath.story({ campaignId, adventureId: adv?.id }));
  }, [lost, router, campaignId, adv?.id]);
  // Only active Agents join a fight (`beat.startEncounter` adds those), so they are who the encounter budget is for
  // and whose number scales a Threat (Core p.326, §11.106).
  const agents = agentsInFight(state);
  // Names for the fight lines, so a card reads "Ork Boy" and not "ork-boy".
  const threatNames = useMemo(() => new Map(bestiary.map((t) => [t.id, t.name])), [bestiary]);

  const report = (r: ActionResult, ok: string) =>
    setMsg(r.ok ? [ok, ...(r.notices ?? [])].join(" · ") : `! ${r.error}`); // notices: a Mutation Test owed

  // A scene card or tab: opens that scene's page.
  const openScene = (id: string) => router.push(gmPath.story({ campaignId, adventureId: adv?.id, sceneId: id }));

  // An editor is done: back to the scene's page, or to the board after a new one. It takes the editor's place in
  // the history, so Back doesn't reopen it.
  const closeEditor = () =>
    router.replace(
      gmPath.story({ campaignId, adventureId: adv?.id, sceneId: editing?.mode === "scene" ? scene?.id : undefined }),
    );

  // A pencil (one section) or EDIT (all of them): the open scene's editor.
  const editScene = (section?: BeatSection) =>
    scene && router.push(gmPath.story({ campaignId, adventureId: adv?.id, sceneId: scene.id, edit: section ?? "all" }));

  // + NEW SCENE or + SCENE FROM A TABLE, in this adventure.
  const addScene = (from: NewScene) => adv && router.push(gmPath.newScene({ campaignId, adventureId: adv.id, from }));

  // The ScenePicker is done: close it and show what it made.
  const donePicking = (done: string) => {
    closeEditor();
    if (done) setMsg(done);
  };

  // Adventure tab: its board, which closes any open editor.
  const pickAdventure = (id: string) => router.push(gmPath.story({ campaignId, adventureId: id }));

  // BOARD / PAGE: the board, or the page of the scene highlighted on it.
  const pickView = (v: StoryView) =>
    router.push(
      gmPath.story({ campaignId, adventureId: adv?.id, sceneId: v === "page" ? (selectedId ?? undefined) : undefined }),
    );

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

  // ▶ RUN THIS SCENE (the page) or RUN FROM HERE (the board): begins it (the scene left goes to DONE and its ON ENTRY
  // picks reach the phones), then SCENE opens with the SCENE BEGUN notice and its UNDO. A scene already being played
  // just goes back to SCENE.
  const run = async (target: Adventure["beats"][number]) => {
    const before = currentScene(codex)?.beat.id ?? null;
    const r = await send({ type: "beat.begin", id: target.id });
    report(
      r,
      `${target.title.toUpperCase()} BEGUN${r.ok && r.revealed?.length ? ` · ${r.revealed.length} REVEALED` : ""}`,
    );
    if (!r.ok) return;
    // A scene already being played begins nothing new, so there is nothing to take back.
    onRun(
      target.status === "active"
        ? null
        : { begun: target.id, before, status: target.status, revealed: r.revealed ?? [] },
    );
  };

  // The board's RUN FROM HERE: the selected scene.
  const runFromBoard = async (id: string) => {
    const target = adv?.beats.find((b) => b.id === id);
    if (target) await run(target);
  };

  const newScenes = (
    <div className="keys">
      <button className="btn primary" onClick={() => addScene("new")}>
        + NEW SCENE
      </button>
      {presets.tables.length > 0 && (
        <button className="btn" onClick={() => addScene("from-table")}>
          + SCENE FROM A TABLE
        </button>
      )}
    </div>
  );

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}

      {!editing && <AdventureBar codex={codex} adv={adv} send={send} onPick={pickAdventure} onReport={report} />}
      {!editing && <ImportAdventure campaignId={campaignId} onReport={report} />}

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
                  onClick={() => pickView(v)}
                >
                  {STORY_VIEWS[v]}
                </button>
              ))}
            </div>
          </div>
          {view === "board" && (
            <>
              <SceneBoard
                adv={adv}
                codex={codex}
                threatNames={threatNames}
                selectedId={selectedId}
                onSelect={setSelected}
                onOpen={openScene}
                onRun={runFromBoard}
              />
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
                onOpen={openScene}
                onEdit={editScene}
                onRun={() => run(scene)}
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
          onDone={closeEditor}
        />
      )}
    </div>
  );
}
