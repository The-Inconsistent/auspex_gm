"use client";
import { useState } from "react";

import { TIERS, startingXp } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { ImportLibrary } from "../import-library/import-library";

// Framework and Tier (Core pp.18–20). At a table the budget comes from the campaign's Tier, and the GM decides whether
// the builder may use the homebrew books; in the library (issue #14) both are the character's owner's to pick.
export function TierStep() {
  const { tier, tierEditable, setTier, homebrew, setHomebrew, importable, go } = useBuilder();
  const [error, setError] = useState<string | null>(null);

  // HOMEBREW switch: saves the setting, then reloads, because the catalogue is served already filtered.
  const toggleHomebrew = async () => {
    const failure = await setHomebrew?.(!homebrew);
    if (failure) return setError(failure);
    window.location.reload();
  };

  return (
    <div className="stack">
      <div className="rule">FRAMEWORK AND TIER</div>
      {tierEditable ? (
        <>
          <p>
            A character starts with <b>{startingXp(tier)} XP</b> (Core p.20) at Rank 1 (Core p.36). Build at the Tier
            the game you have in mind plays at: a campaign only takes a character made at its own Tier.
          </p>
          <div className="field">
            <span className="label">TIER</span>
            <div className="keys">
              {TIERS.map((t) => (
                <button
                  key={t}
                  className={`btn${t === tier ? " primary" : ""}`}
                  aria-pressed={t === tier}
                  onClick={() => setTier(t)}
                >
                  T{t}
                  <span className="dim"> · {startingXp(t)} XP</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p>
          The campaign is <b>Tier {tier}</b>, so the character starts with <b>{startingXp(tier)} XP</b> (Core p.20) at
          Rank 1 (Core p.36). The GM sets the Tier and the Framework in PARTY.
        </p>
      )}
      {importable && <ImportLibrary />}
      <div className="plate stack">
        <div className="rule">SOURCES</div>
        <p>
          {homebrew
            ? "Homebrew is allowed: An Abundance of Apocrypha and Legacy of the Necrontyr are in the lists."
            : "Official books only. An Abundance of Apocrypha and Legacy of the Necrontyr are left out."}
        </p>
        {setHomebrew ? (
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
