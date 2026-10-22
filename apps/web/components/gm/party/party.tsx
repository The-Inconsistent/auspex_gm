"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  activeCharacterIds,
  type ActionResult,
  type Character,
  type Codex,
  type LiveState,
  type MutationTable,
  type Wargear,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { gmPath } from "@/lib/gm-path/gm-path";

import { AgentCard } from "./components/agent-card/agent-card";
import { Dossier } from "./components/dossier/dossier";
import { AscendPanel } from "./components/ascend-panel/ascend-panel";
import { MorePanel } from "./components/more-panel/more-panel";
import { RespiteSheet } from "./components/respite-sheet/respite-sheet";
import { RoomInvite } from "./components/room-invite/room-invite";
import { SessionBand } from "./components/session-band/session-band";
import { SessionHistory } from "./components/session-history/session-history";
import type { DossierTab, PartyMsg } from "./constants";

type PartyProps = {
  state: LiveState;
  codex: Codex;
  send: Send;
  wargear: Wargear[];
  mutations: MutationTable[];
  // From the URL (/party/<agent>/<tab>, /party/respite): the dossier open and its tab, or RESPITE's sheet.
  dossierId?: string;
  dossierTab: DossierTab;
  resting: boolean;
};

// PARTY: the session band, the Agents as one-button cards, and one dossier side sheet for the Agent tapped. What PARTY
// does rarely sits behind MORE; the session journal folds below the roster.
export function Party({ state, codex, send, wargear, mutations, dossierId, dossierTab, resting }: PartyProps) {
  const router = useRouter();
  const campaignId = state.campaign.id;
  const [msg, setMsg] = useState<PartyMsg | null>(null);
  const [more, setMore] = useState(false); // MORE's disclosure
  const open = codex.sessions.find((s) => !s.endedAt);
  const { members } = state.access;
  const active = activeCharacterIds(state.access);
  const agents = state.characters.filter((c) => active.has(c.id));
  const reserve = state.characters.filter((c) => !active.has(c.id));
  const dossier = state.characters.find((c) => c.id === dossierId);
  // A link to an Agent that's gone (deleted, or another campaign's): back to the roster.
  const lost = !!dossierId && !dossier;
  // External system: the browser's URL, through Next's router.
  useEffect(() => {
    if (lost) router.replace(gmPath.party({ campaignId }));
  }, [lost, router, campaignId]);
  // A sheet closed (the dossier, RESPITE): the roster takes its place in the history, so Back doesn't reopen it.
  const toRoster = () => router.replace(gmPath.party({ campaignId }));
  // An Agent card: their dossier's URL.
  const openDossier = (id: string) => router.push(gmPath.party({ campaignId, characterId: id }));
  // A dossier tab: its URL, in place of the last one, so Back closes the sheet rather than stepping through its tabs.
  const pickDossierTab = (tab: DossierTab) =>
    dossier && router.replace(gmPath.party({ campaignId, characterId: dossier.id, tab }));
  const seatOf = (id: string) => ({
    member: members.find((m) => m.characterId === id)?.name ?? null,
    active: active.has(id),
  });

  // A refusal, or what the action did. An ack may also carry `notices`: lines only the server can know, because they
  // compare before with after — who crossed a Rank on `session.end`, whether the group may Ascend (Core pp.146–147).
  const report = (r: ActionResult, ok: string) =>
    setMsg((m) => ({
      text: r.ok ? [ok, ...(r.notices ?? [])].join(" · ") : `! ${r.error}`,
      id: (m?.id ?? 0) + 1,
    }));

  // DELETE LAST SESSION's line: the server's notice says what it removed and that the XP stays.
  const sessionReport = (r: ActionResult, ok: string) =>
    report(r, r.ok && r.notices?.length ? r.notices.join(" · ") : ok);

  const card = (c: Character) => (
    <AgentCard
      key={c.id}
      character={c}
      tier={state.campaign.tier}
      seat={seatOf(c.id)}
      onOpen={() => openDossier(c.id)}
    />
  );

  return (
    <div className="pad stack">
      {msg && (
        <div className={msg.text.startsWith("!") ? "red" : "accent"} role="status">
          {msg.text}
        </div>
      )}

      <SessionBand
        campaign={state.campaign}
        sessions={codex.sessions}
        players={state.characters.length}
        send={send}
        msg={msg}
        onResult={report}
      />

      <div id="agents" className="stack">
        <div className="party-head">
          <div className="rule">ACTIVE AGENTS · {agents.length}</div>
          <div className="keys" style={{ paddingTop: 0 }}>
            <RoomInvite compact send={send} onError={(e) => report({ ok: false, error: e }, "")} />
            <button className="btn" disabled={!agents.length} onClick={() => router.push(gmPath.respite(campaignId))}>
              RESPITE…
            </button>
            <button className="btn" aria-expanded={more} aria-controls="party-more" onClick={() => setMore(!more)}>
              MORE
            </button>
          </div>
        </div>
        {more && (
          <MorePanel state={state} active={active} send={send} onResult={report} onClose={() => setMore(false)} />
        )}
        <div className="party-grid">{agents.map(card)}</div>
        {reserve.length > 0 && (
          <details className="party-fold" open={!agents.length || undefined}>
            <summary className="rule">IN RESERVE · {reserve.length}</summary>
            <div className="party-grid">{reserve.map(card)}</div>
          </details>
        )}
      </div>

      {/* Always on the page, folded: SETUP's Tier step scrolls to #ascend and opens it. */}
      <details className="party-fold">
        <summary className="rule">ASCENSION</summary>
        <AscendPanel characters={state.characters} tier={state.campaign.tier} send={send} onResult={report} />
      </details>

      {codex.sessions.length > 0 && (
        <details className="party-fold">
          <summary className="rule">SESSION JOURNAL · {codex.sessions.length}</summary>
          <SessionHistory sessions={codex.sessions} send={send} onResult={sessionReport} />
        </details>
      )}

      {dossier && (
        <Dossier
          key={dossier.id}
          character={dossier}
          state={state}
          seat={seatOf(dossier.id)}
          sessionId={open?.id ?? null}
          wargear={wargear}
          mutations={mutations}
          send={send}
          msg={msg}
          onResult={report}
          tab={dossierTab}
          onTab={pickDossierTab}
          onClose={toRoster}
        />
      )}
      {resting && <RespiteSheet characters={agents} send={send} msg={msg} onResult={report} onClose={toRoster} />}
    </div>
  );
}
