"use client";
import { sceneNumber } from "@/components/gm/prep/utils";

import type { Codex } from "@wg/shared";

type NoSceneProps = { codex: Codex; onBegin: (id: string) => void; onStartFight: () => void };

// No scene is being played: each adventure's next planned scene to BEGIN (the running ones first), or a fight nobody planned.
export function NoScene({ codex, onBegin, onStartFight }: NoSceneProps) {
  const next = codex.adventures
    .flatMap((adventure) => {
      const i = adventure.beats.findIndex((b) => b.status === "planned");
      return i >= 0 ? [{ adventure, beat: adventure.beats[i]!, index: i }] : []; // found just above
    })
    .sort((a, b) => Number(b.adventure.status === "running") - Number(a.adventure.status === "running"));
  return (
    <section className="scene-none" aria-label="No scene">
      <h2 className="scene-title">NO SCENE IS BEING PLAYED</h2>
      {next.length > 0 ? (
        <div className="list">
          {next.map(({ adventure, beat, index }) => (
            <div key={beat.id} className="item scene-next-scene">
              <div className="scene-next-scene-text">
                <span className="label">
                  {adventure.title.toUpperCase()}
                  {adventure.status === "running" && " · RUNNING"}
                </span>
                <b>
                  {sceneNumber(index)} · {beat.title}
                </b>
              </div>
              <button
                type="button"
                className="btn primary"
                aria-label={`Begin scene ${sceneNumber(index)}, ${beat.title}`}
                onClick={() => onBegin(beat.id)}
              >
                BEGIN
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="dim">No scene is planned. Write one in STORY, or start a fight.</p>
      )}
      <div className="keys">
        <button type="button" className="btn" onClick={onStartFight}>
          START A FIGHT
        </button>
      </div>
    </section>
  );
}
