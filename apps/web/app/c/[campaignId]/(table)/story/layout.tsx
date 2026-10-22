"use client";
import { useParams, useRouter, useSelectedLayoutSegments } from "next/navigation";
import type { ReactNode } from "react";

import { useGm } from "@/components/gm/gm-app/gm-context";
import { Story } from "@/components/gm/story/story";
import type { Editing } from "@/components/gm/story/types";
import { asBeatSection, gmPath } from "@/lib/gm-path/gm-path";
import type { Begun } from "@/lib/scene-reveal/scene-reveal";

type StoryParams = { adventureId?: string; sceneId?: string; section?: string };

// STORY stays mounted across its own routes (board, page, editors), so its line of news survives opening an editor.
// The pages below only give each URL its shape; this reads which one is open.
export default function StoryLayout({ children }: { children: ReactNode }) {
  const { campaignId, state, codex, send, bestiary, presets, wargear, setBegun } = useGm();
  const router = useRouter();
  const { adventureId, sceneId, section } = useParams<StoryParams>();
  const leaf = useSelectedLayoutSegments().at(-1);
  const editing: Editing | undefined =
    leaf === "new"
      ? { mode: "new" }
      : leaf === "from-table"
        ? { mode: "table" }
        : leaf === "edit" || section
          ? { mode: "scene", section: section ? asBeatSection(section) : undefined }
          : undefined;

  // RUN: SCENE keeps the begin for its notice and UNDO, and opens on the fight while one is live.
  const run = (b: Begun | null) => {
    if (b) setBegun(b);
    router.push(gmPath.scene(campaignId, !!state.encounter));
  };

  return (
    <>
      <Story
        state={state}
        codex={codex}
        send={send}
        bestiary={bestiary}
        presets={presets}
        wargear={wargear}
        adventureId={adventureId}
        sceneId={sceneId}
        editing={editing}
        onRun={run}
      />
      {children}
    </>
  );
}
