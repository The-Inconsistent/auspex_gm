"use client";
import { useState } from "react";

import { sceneNumber } from "@/components/gm/prep/utils";

import type { Adventure, SceneBeat } from "../../types";

type WhereNextProps = {
  adventure: Adventure;
  beat: SceneBeat;
  onBegin: (id: string) => void;
  onPreview: (id: string) => void;
};

// One tap ends this scene and begins the next (beat.begin): a button per exit, its label in italic, then where it goes.
// An exit with no scene yet is shown, disabled. OTHER SCENE… lists this adventure's other scenes to preview and begin.
export function WhereNext({ adventure, beat, onBegin, onPreview }: WhereNextProps) {
  const [others, setOthers] = useState(false);
  const target = (id: string | null) => {
    const i = adventure.beats.findIndex((b) => b.id === id);
    return i >= 0 ? { n: sceneNumber(i), title: adventure.beats[i]!.title } : null; // found just above
  };

  return (
    <footer className="scene-next" aria-label="Where next">
      <div className="scene-next-head">
        <span className="label accent">WHERE NEXT</span>
        <span className="dim">One tap ends this scene and begins the next.</span>
      </div>
      <div className="scene-next-row">
        {beat.exits.map((e, i) => {
          const to = target(e.beatId);
          return (
            <button
              key={i}
              type="button"
              className="btn scene-exit"
              disabled={!to}
              aria-label={
                to
                  ? `${e.label}. Ends this scene and begins scene ${to.n}, ${to.title}`
                  : `${e.label}. No scene is planned for this yet`
              }
              onClick={() => to && e.beatId && onBegin(e.beatId)}
            >
              <i>{e.label}</i>
              <span>{to ? `→ ${to.n} ${to.title.toUpperCase()}` : "NO SCENE YET"}</span>
            </button>
          );
        })}
        {!beat.exits.length && <span className="dim">This scene has no exits written.</span>}
        <button type="button" className="btn sm scene-other" aria-expanded={others} onClick={() => setOthers(!others)}>
          OTHER SCENE…
        </button>
      </div>
      {others && (
        <div className="scene-next-row" role="group" aria-label="This adventure's other scenes">
          {adventure.beats.map((b, i) =>
            b.id === beat.id ? null : (
              <button key={b.id} type="button" className="btn sm" onClick={() => onPreview(b.id)}>
                {sceneNumber(i)} {b.title.toUpperCase()}
              </button>
            ),
          )}
        </div>
      )}
    </footer>
  );
}
