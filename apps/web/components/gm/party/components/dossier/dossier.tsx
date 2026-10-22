"use client";
import {
  deriveStats,
  rankOf,
  type ActionResult,
  type Character,
  type LiveState,
  type MutationTable,
  type Wargear,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { seatLine } from "@/lib/party-view/party-view";

import { DOSSIER_TABS, type DossierTab, type PartyMsg } from "../../constants";
import { PartyDialog } from "../party-dialog/party-dialog";
import { AdvanceTab } from "./components/advance-tab/advance-tab";
import { GearTab } from "./components/gear-tab/gear-tab";
import { SeatTab } from "./components/seat-tab/seat-tab";
import { StatusTab } from "./components/status-tab/status-tab";

type DossierProps = {
  character: Character;
  state: LiveState;
  seat: { member: string | null; active: boolean };
  sessionId: string | null; // the running session, which a requisition counts against
  wargear: Wargear[];
  mutations: MutationTable[];
  send: Send;
  msg: PartyMsg | null;
  onResult: (r: ActionResult, ok: string) => void;
  tab: DossierTab; // from the URL (/party/<agent>/gear)
  onTab: (tab: DossierTab) => void;
  onClose: () => void;
};

// One Agent's dossier: a side sheet with four tabs, each label carrying a value. Every control the old PARTY card had
// is in one of them; a refusal shows at the top of the sheet. Its tab is in the URL, STATUS when none is.
export function Dossier({
  character: c,
  state,
  seat,
  sessionId,
  wargear,
  mutations,
  send,
  msg,
  onResult,
  tab,
  onTab,
  onClose,
}: DossierProps) {
  const tier = state.campaign.tier;
  const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
  const labels: Record<DossierTab, string> = {
    status: "STATUS",
    gear: `GEAR · WEALTH ${c.stats.wealth}`,
    advance: `ADVANCE · ${c.xp} XP`,
    seat: "SEAT",
  };

  return (
    <PartyDialog label={`${c.name}: dossier`} title={c.name.toUpperCase()} side msg={msg} onClose={onClose}>
      <div className="dim">
        {c.stats.archetype || "NO STATS YET"} · {seatLine(seat)} · RANK {rankOf(c.xp)}
      </div>
      <div className="tabs sub" role="tablist" aria-label="Dossier">
        {DOSSIER_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`dossier-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="dossier-panel"
            className="tab"
            onClick={() => onTab(t)}
          >
            {labels[t]}
          </button>
        ))}
      </div>
      <div id="dossier-panel" role="tabpanel" aria-labelledby={`dossier-tab-${tab}`}>
        {tab === "status" && <StatusTab character={c} tier={tier} send={send} onResult={onResult} />}
        {tab === "gear" && (
          <GearTab
            character={c}
            influence={d.influence}
            wargear={wargear}
            sessionId={sessionId}
            send={send}
            onResult={onResult}
          />
        )}
        {tab === "advance" && (
          <AdvanceTab character={c} state={state} mutations={mutations} send={send} onResult={onResult} />
        )}
        {tab === "seat" && <SeatTab character={c} send={send} onResult={onResult} />}
      </div>
    </PartyDialog>
  );
}
