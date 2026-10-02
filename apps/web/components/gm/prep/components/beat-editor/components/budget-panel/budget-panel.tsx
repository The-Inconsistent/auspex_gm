"use client";
import { useState } from "react";

import { encounterBudget, rosterTally, type Threat } from "@wg/shared";

import { BudgetLines } from "@/components/ui/budget-lines/budget-lines";

import type { EncounterEntry } from "../../../../types";

type BudgetPanelProps = { entries: EncounterEntry[]; agents: number; bestiary: Threat[]; tier: number };

// The prepared roster against Building Encounters (Threat Assessment p.8), sized for the Agents a fight would actually
// add — the active ones, as `beat.startEncounter` does. FORTIFIED is the GM's read of the ground (cover, clear lines of
// sight, distance or surprise) and doubles every target; it is a toggle here, not a stored flag (rules-flow §11.82).
export function BudgetPanel({ entries, agents, bestiary, tier }: BudgetPanelProps) {
  const [fortified, setFortified] = useState(false);
  const tally = rosterTally(entries, { bestiary, tier });
  const budget = encounterBudget({ agents, fortified });

  return (
    <div className="plate pad stack" style={{ gap: 8 }}>
      <div className="keys" style={{ alignItems: "center" }}>
        <span className="dim" style={{ fontSize: 12 }}>
          {agents} ACTIVE {agents === 1 ? "AGENT" : "AGENTS"} · TIER {tier} · THREAT ASSESSMENT P.8
        </span>
        <button
          className={`btn sm ${fortified ? "primary" : ""}`}
          aria-pressed={fortified}
          onClick={() => setFortified(!fortified)}
        >
          FORTIFIED
        </button>
      </div>
      <BudgetLines tally={tally} budget={budget} />
    </div>
  );
}
