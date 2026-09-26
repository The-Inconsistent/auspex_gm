"use client";
import { useState } from "react";

import { startingXp } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { useBuilder } from "../../builder-context";

type TierStepProps = { homebrew: boolean; send: Send };

// Framework and Tier (Core pp.18–20): the budget comes from the campaign's Tier. The GM also decides here whether the
// builder may use the homebrew books.
export function TierStep({ homebrew, send }: TierStepProps) {
  const { tier, role, go } = useBuilder();
  const [error, setError] = useState<string | null>(null);

  // HOMEBREW switch (GM): saves the campaign setting, then reloads, because the catalogue is served already filtered.
  const toggleHomebrew = async () => {
    const r = await send({ type: "campaign.update", homebrew: !homebrew });
    if (!r.ok) return setError(r.error);
    window.location.reload();
  };

  return (
    <div className="stack">
      <div className="rule">FRAMEWORK AND TIER</div>
      <p>
        The campaign is <b>Tier {tier}</b>, so the character starts with <b>{startingXp(tier)} XP</b> (Core p.20) at
        Rank 1 (Core p.36). The GM sets the Tier and the Framework in PARTY.
      </p>
      <div className="plate stack">
        <div className="rule">SOURCES</div>
        <p>
          {homebrew
            ? "Homebrew is allowed: An Abundance of Apocrypha and Legacy of the Necrontyr are in the lists."
            : "Official books only. An Abundance of Apocrypha and Legacy of the Necrontyr are left out."}
        </p>
        {role === "gm" ? (
          <div>
            <button className="btn" aria-pressed={homebrew} onClick={toggleHomebrew}>
              {homebrew ? "TURN HOMEBREW OFF" : "ALLOW HOMEBREW"}
            </button>
          </div>
        ) : (
          <p className="dim">Only the GM changes this.</p>
        )}
        {error && <div className="red">! {error}</div>}
      </div>
      <div>
        <button className="btn primary" onClick={() => go("archetype")}>
          NEXT: ARCHETYPE
        </button>
      </div>
    </div>
  );
}
