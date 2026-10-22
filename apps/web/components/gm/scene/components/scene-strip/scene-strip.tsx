"use client";
import { Check } from "lucide-react";

import { sceneNumber } from "@/components/gm/prep/utils";

import type { Adventure } from "../../types";

type SceneStripProps = {
  adventure: Adventure;
  currentId: string;
  previewId: string | null;
  onPick: (id: string) => void;
};

// What a tab says in words, so a played scene isn't only a tick.
const sayStatus = (status: string) =>
  status === "done" ? "played" : status === "skipped" ? "skipped" : "not yet played";

// This adventure's scenes as small tabs: the current one crimson, the played ones ticked. A tap on another previews it.
export function SceneStrip({ adventure, currentId, previewId, onPick }: SceneStripProps) {
  return (
    <nav className="scene-strip" aria-label="Scenes in this adventure">
      {adventure.beats.map((b, i) => {
        const n = sceneNumber(i);
        const current = b.id === currentId;
        return (
          <button
            key={b.id}
            type="button"
            className={`scene-tab ${b.status === "done" ? "done" : ""} ${b.id === previewId ? "peek" : ""}`}
            aria-current={current ? "step" : undefined}
            aria-label={current ? `Scene ${n}, ${b.title}, the current scene` : `Scene ${n}, ${sayStatus(b.status)}`}
            onClick={() => onPick(b.id)}
          >
            {n}
            {b.status === "done" && <Check size={12} strokeWidth={3} aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
