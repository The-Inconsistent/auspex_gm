"use client";
import { useRef, useState } from "react";

import {
  activeCharacterIds,
  type ActionInput,
  type Codex,
  type JournalItem,
  type LiveState,
  type ScenePresets,
  type Threat,
} from "@wg/shared";

import { Tracker } from "@/components/gm/tracker/tracker";
import type { Send } from "@/hooks/use-table/use-table";
import { currentScene } from "@/lib/scene/scene";
import { undoBegin, type Begun } from "@/lib/scene-reveal/scene-reveal";

import { BegunNotice } from "./components/begun-notice/begun-notice";
import { InThisScene } from "./components/in-this-scene/in-this-scene";
import { NoScene } from "./components/no-scene/no-scene";
import { ScenePage } from "./components/scene-page/scene-page";
import { ScenePreview } from "./components/scene-preview/scene-preview";
import { SceneStrip } from "./components/scene-strip/scene-strip";
import { WhereNext } from "./components/where-next/where-next";
import type { SceneLayer } from "./constants";
import type { Report, SceneBeat } from "./types";

type SceneProps = {
  state: LiveState;
  codex: Codex;
  journal: JournalItem[];
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  onEdit: (beatId: string) => void; // opens that scene in STORY
  layer: SceneLayer; // from the URL: /scene or /scene/fight
  onLayer: (layer: SceneLayer) => void;
  notice: Begun | null; // the last begin, held by the GM shell so one from STORY keeps its UNDO here
  onNotice: (notice: Begun | null) => void;
};

// SCENE: the GM's play home. The scene being played as the book prints it (the page, what is in it, where next), and
// while a fight is live a switch to the tracker. One scene is played at a time (beat.begin); its ON ENTRY picks reach the
// phones when it begins, and a one-line notice can take that back.
export function Scene({
  state,
  codex,
  journal,
  send,
  bestiary,
  presets,
  onEdit,
  layer,
  onLayer,
  notice,
  onNotice,
}: SceneProps) {
  const [previewId, setPreviewId] = useState<string | null>(null); // another scene, read-only
  const [msg, setMsg] = useState<string | null>(null);
  const current = currentScene(codex);
  const seated = activeCharacterIds(state.access); // whose phones a called Test reaches
  // The fight shows only while one is live: when it ends the scene is back, whatever the switch said.
  const showing: SceneLayer = state.encounter ? layer : "scene";
  const beats = current?.adventure.beats ?? [];
  const previewAt = previewId && previewId !== current?.beat.id ? beats.findIndex((b) => b.id === previewId) : -1;
  const previewBeat = previewAt >= 0 ? beats[previewAt] : undefined; // none when the scene was deleted or moved meanwhile
  const busy = useRef(false); // one begin, fight start or undo at a time: a double tap sends once
  const [undoing, setUndoing] = useState(false);

  const once = async (run: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await run();
    } finally {
      busy.current = false;
    }
  };

  const report: Report = (r, ok) => setMsg(r.ok ? [ok, ...(r.notices ?? [])].join(" · ") : `! ${r.error}`);

  // BEGIN: makes a scene the one being played, and keeps what UNDO needs to take it back.
  const begin = (id: string) =>
    once(async () => {
      const before = current?.beat.id ?? null;
      const status = codex.adventures.flatMap((a) => a.beats).find((b) => b.id === id)?.status ?? "planned"; // UNDO restores it
      const r = await send({ type: "beat.begin", id });
      if (!r.ok) return setMsg(`! ${r.error}`);
      setMsg(null);
      setPreviewId(null);
      onNotice({ begun: id, before, status, revealed: r.revealed ?? [] });
    });

  // UNDO: the scene before is current again, then what the begin revealed is sealed; stops at the first refusal.
  const undo = () =>
    once(async () => {
      if (!notice) return;
      setUndoing(true);
      try {
        const steps: ActionInput[] = undoBegin({ codex, ...notice });
        for (const step of steps) {
          const r = await send(step);
          if (!r.ok) return setMsg(`! ${r.error}`);
        }
        onNotice(null);
        setMsg("SCENE BEGUN, TAKEN BACK");
      } finally {
        setUndoing(false);
      }
    });

  // START FIGHT: the scene's prepared fight (which also begins the scene), or an empty one; then the tracker.
  const startFight = (beat: SceneBeat | null) =>
    once(async () => {
      const r = await send(
        beat?.encounter.length ? { type: "beat.startEncounter", id: beat.id } : { type: "encounter.start" },
      );
      if (!r.ok) return setMsg(`! ${r.error}`);
      setMsg(null);
      onLayer("fight");
    });

  return (
    <div className={showing === "fight" ? "scene fighting" : "scene"}>
      {msg && (
        <div className={msg.startsWith("!") ? "red" : "accent"} role="status">
          {msg}
        </div>
      )}
      {current && (
        <SceneStrip
          adventure={current.adventure}
          currentId={current.beat.id}
          previewId={previewBeat?.id ?? null}
          onPick={(id) => setPreviewId(id === current.beat.id ? null : id)}
        />
      )}
      {notice && (
        <BegunNotice
          codex={codex}
          revealed={notice.revealed}
          busy={undoing}
          onUndo={undo}
          onDismiss={() => onNotice(null)}
        />
      )}
      {state.encounter && (
        <div className="scene-layers" role="group" aria-label="Layer">
          <button type="button" aria-pressed={showing === "scene"} onClick={() => onLayer("scene")}>
            THE SCENE
          </button>
          <button type="button" aria-pressed={showing === "fight"} onClick={() => onLayer("fight")}>
            FIGHT · ROUND {state.encounter.round}
          </button>
        </div>
      )}
      {state.encounter && (
        // Mounted for the whole fight and only hidden on THE SCENE, so the chronicle, UNDO HIT and selection survive a flip.
        <div className="scene-fight" hidden={showing !== "fight"}>
          <Tracker
            state={state}
            journal={journal}
            send={send}
            bestiary={bestiary}
            lookups={presets.lookups}
            mutations={presets.mutations}
          />
        </div>
      )}
      {showing === "fight" ? null : !current ? (
        <NoScene codex={codex} onBegin={begin} onStartFight={() => startFight(null)} />
      ) : previewBeat ? (
        <ScenePreview
          beat={previewBeat}
          index={previewAt}
          onBegin={() => begin(previewBeat.id)}
          onBack={() => setPreviewId(null)}
        />
      ) : (
        <>
          <div className="scene-cols">
            <ScenePage
              key={`page-${current.beat.id}`} // a new scene starts with GM NOTES and the folds closed, and no FEAR ticks
              state={state}
              codex={codex}
              beat={current.beat}
              index={current.index}
              send={send}
              bestiary={bestiary}
              presets={presets}
              agents={state.characters.filter((c) => seated.has(c.id))}
              onReport={report}
              onEdit={onEdit}
            />
            <InThisScene
              key={`cast-${current.beat.id}`}
              codex={codex}
              characters={state.characters}
              beat={current.beat}
              fightLive={!!state.encounter}
              onStartFight={startFight}
              onError={(e) => e && setMsg(`! ${e}`)}
              send={send}
            />
          </div>
          <WhereNext adventure={current.adventure} beat={current.beat} onBegin={begin} onPreview={setPreviewId} />
        </>
      )}
    </div>
  );
}
