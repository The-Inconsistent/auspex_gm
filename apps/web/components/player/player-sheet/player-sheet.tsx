"use client";
import { useState } from "react";

import { deriveStats, type Character, type Codex, type LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";
import { revealAnchor } from "@/lib/anchor/anchor";

import { Dossier } from "./components/dossier/dossier";
import { Followers } from "./components/followers/followers";
import { Glance } from "./components/glance/glance";
import { SHEET_VIEWS, type SheetView } from "./constants";
import { myFollowers } from "./utils";

type PlayerSheetProps = { me: Character; state: LiveState; codex: Codex; send: Send };

// The player's SHEET tab (replaces `<Sheet requests />` there): AT A GLANCE for the middle of a fight, the DOSSIER for the
// whole Agent. The shell's strip above already holds Wounds, Shock, Wrath, Glory and Conditions, so they aren't repeated.
export function PlayerSheet({ me, state, codex, send }: PlayerSheetProps) {
  const tier = state.campaign.tier;
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier });
  const [chosen, setView] = useState<SheetView>("glance");
  const followers = myFollowers(codex, me.id);
  const views = (Object.keys(SHEET_VIEWS) as SheetView[]).filter((v) => v !== "followers" || followers.length > 0);
  const view = views.includes(chosen) ? chosen : "glance"; // TAKE BACK can empty FOLLOWERS under an open tab
  const [error, setError] = useState<string | null>(null);
  // "ALL 18 SKILLS": opens the DOSSIER and scrolls to its dice once it has drawn.
  const handleAllSkills = () => {
    setView("dossier");
    requestAnimationFrame(() => revealAnchor("ps-skills", "start"));
  };

  return (
    <div className="ps">
      <div className="ps-seg" role="group" aria-label="Sheet views">
        {views.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {SHEET_VIEWS[v].label}
            {v === "followers" && ` · ${followers.length}`}
          </button>
        ))}
      </div>
      {view === "glance" && <Glance me={me} d={d} onAllSkills={handleAllSkills} />}
      {view === "dossier" && <Dossier me={me} state={state} codex={codex} send={send} onError={setError} />}
      {view === "followers" && <Followers npcs={followers} tier={tier} />}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
