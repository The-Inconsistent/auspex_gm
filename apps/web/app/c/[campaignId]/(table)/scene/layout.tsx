"use client";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useGm } from "@/components/gm/gm-app/gm-context";
import type { SceneLayer } from "@/components/gm/scene/constants";
import { Scene } from "@/components/gm/scene/scene";
import { gmPath } from "@/lib/gm-path/gm-path";

// SCENE and its FIGHT layer (/scene/fight) share this layout, so the tracker stays mounted across the switch and keeps
// its selection, chronicle and UNDO HIT, as it did when the layer was local state.
export default function SceneLayout({ children }: { children: ReactNode }) {
  const { campaignId, state, codex, journal, send, bestiary, presets, begun, setBegun } = useGm();
  const router = useRouter();
  const fight = useSelectedLayoutSegment() === "fight";
  // The fight ended (here or on another tablet): the URL follows the scene coming back. External system: the
  // browser's URL, through Next's router.
  const over = fight && !state.encounter;
  useEffect(() => {
    if (over) router.replace(gmPath.scene(campaignId));
  }, [over, router, campaignId]);

  // SCENE's EDIT: the scene's page in STORY.
  const edit = (id: string) => {
    const adventure = codex.adventures.find((a) => a.beats.some((b) => b.id === id));
    router.push(gmPath.story({ campaignId, adventureId: adventure?.id, sceneId: adventure && id }));
  };

  // THE SCENE / FIGHT switch, and START FIGHT: the layer's URL.
  const showLayer = (layer: SceneLayer) => router.push(gmPath.scene(campaignId, layer === "fight"));

  return (
    <>
      <Scene
        state={state}
        codex={codex}
        journal={journal}
        send={send}
        bestiary={bestiary}
        presets={presets}
        onEdit={edit}
        layer={fight ? "fight" : "scene"}
        onLayer={showLayer}
        notice={begun}
        onNotice={setBegun}
      />
      {children}
    </>
  );
}
