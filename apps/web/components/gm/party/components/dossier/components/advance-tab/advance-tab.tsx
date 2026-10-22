"use client";
import Link from "next/link";
import { useState } from "react";

import { rankOf, type ActionResult, type Character, type LiveState, type MutationTable } from "@wg/shared";

import { SheetDialog } from "@/components/ui/sheet-dialog/sheet-dialog";
import type { Send } from "@/hooks/use-table/use-table";

import { MutationRoll } from "../../../mutation-roll/mutation-roll";

type AdvanceTabProps = {
  character: Character;
  state: LiveState;
  mutations: MutationTable[];
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// ADVANCE: XP and Rank (Core p.146), what's left to spend, Mutations, the builder and the play sheet.
export function AdvanceTab({ character: c, state, mutations, send, onResult }: AdvanceTabProps) {
  const [mutating, setMutating] = useState(false);
  return (
    <div className="stack">
      {/* Rank follows this character's own XP (Core p.146); what is left to spend is what advancement hasn't bought
          yet, so the GM can nudge people between sessions. */}
      <div className="party-values">
        <div className="item">
          <span className="label">XP</span>
          <span className="party-num">{c.xp}</span>
          <span className="dim">RANK {rankOf(c.xp)}</span>
          {c.build && c.xp > c.xpSpent && <span className="accent">{c.xp - c.xpSpent} XP TO SPEND</span>}
        </div>
      </div>
      <div className="keys">
        <button className="btn" aria-expanded={mutating} onClick={() => setMutating(!mutating)}>
          MUTATIONS{c.stats.mutations.length ? ` (${c.stats.mutations.length})` : ""}
        </button>
        {/* The one editor (issue #18): name, portrait, detail, build and the GM's overrides. A draft a player sent
            opens there too: the GM ticks what only the GM judges, and saves it. */}
        <Link className={`btn ${c.draft ? "primary" : ""}`} href={`/c/${state.campaign.id}/build/${c.id}`}>
          {c.draft ? "OPEN DRAFT" : "EDIT"}
        </Link>
        <SheetDialog me={c} tier={state.campaign.tier} table={{ state, send }} />
      </div>
      {mutating && <MutationRoll character={c} tables={mutations} send={send} onResult={onResult} />}
    </div>
  );
}
