"use client";
import { useState } from "react";

import { deriveStats, type Character, type LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";
import { revealAnchor } from "@/lib/anchor/anchor";

import { Dossier } from "./components/dossier/dossier";
import { Glance } from "./components/glance/glance";
import { SHEET_VIEWS, type SheetView } from "./constants";

type PlayerSheetProps = { me: Character; state: LiveState; send: Send };

// The player's SHEET tab (replaces `<Sheet requests />` there): AT A GLANCE for the middle of a fight, the DOSSIER for the
// whole Agent. The shell's strip above already holds Wounds, Shock, Wrath, Glory and Conditions, so they aren't repeated.
export function PlayerSheet({ me, state, send }: PlayerSheetProps) {
  const tier = state.campaign.tier;
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier });
  const [view, setView] = useState<SheetView>("glance");
  const [error, setError] = useState<string | null>(null);
  // "ALL 18 SKILLS": opens the DOSSIER and scrolls to its dice once it has drawn.
  const handleAllSkills = () => {
    setView("dossier");
    requestAnimationFrame(() => revealAnchor("ps-skills", "start"));
  };

  return (
    <div className="ps">
      <div className="ps-seg" role="group" aria-label="Sheet views">
        {(Object.keys(SHEET_VIEWS) as SheetView[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {SHEET_VIEWS[v].label}
          </button>
        ))}
      </div>
      {view === "glance" ? (
        <Glance me={me} d={d} onAllSkills={handleAllSkills} />
      ) : (
        <Dossier me={me} state={state} send={send} onError={setError} />
      )}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
