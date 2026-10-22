"use client";
import { sceneNumber } from "@/components/gm/prep/utils";
import { Mentions } from "@/components/ui/mentions/mentions";

import type { SceneBeat } from "../../types";

type ScenePreviewProps = { beat: SceneBeat; index: number; onBegin: () => void; onBack: () => void };

// Another scene, read-only: its goal and read-aloud, with BEGIN THIS SCENE. Nothing changes until that tap.
export function ScenePreview({ beat, index, onBegin, onBack }: ScenePreviewProps) {
  return (
    <section className="scene-preview" aria-label={`Preview of scene ${sceneNumber(index)}`}>
      <span className="label">
        PREVIEW · SCENE {sceneNumber(index)} · {beat.type.toUpperCase()} · {beat.status.toUpperCase()}
      </span>
      <h2 className="scene-title">{beat.title}</h2>
      {beat.goal && (
        <div className="scene-goal">
          <span className="label accent">GOAL</span>
          <b>
            <Mentions text={beat.goal} self={beat.id} />
          </b>
        </div>
      )}
      {beat.readAloud && (
        <div className="scene-read">
          <span className="scene-read-tag">READ ALOUD</span>
          <p>
            <Mentions text={beat.readAloud} self={beat.id} />
          </p>
        </div>
      )}
      <div className="keys">
        <button type="button" className="btn primary" onClick={onBegin}>
          BEGIN THIS SCENE
        </button>
        <button type="button" className="btn" onClick={onBack}>
          BACK
        </button>
      </div>
    </section>
  );
}
