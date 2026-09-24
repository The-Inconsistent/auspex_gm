"use client";
import { useEffect, useRef, useState } from "react";

import { Show, UserButton } from "@wg/auth/react";
import { sideUpNext } from "@wg/shared";

import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { useTable } from "@/hooks/use-table/use-table";

import { Fight } from "./components/fight/fight";
import { Intel } from "./components/intel/intel";
import { Sheet } from "./components/sheet/sheet";
import { PLAYER_TABS, TURN_VIBRATION, type PlayerTab } from "./constants";

type PlayerAppProps = { campaignId: string; characterId: string };

export function PlayerApp({ campaignId, characterId }: PlayerAppProps) {
  const { state, codex, online, send } = useTable(campaignId);
  const [tab, setTab] = useState<PlayerTab>("SHEET");
  const me = state?.characters.find((c) => c.id === characterId);
  const enc = state?.encounter ?? null;
  const myCombatant = enc?.combatants.find((c) => c.kind === "pc" && c.characterId === characterId);
  const myTurn = !!enc && !!myCombatant && enc.currentId === myCombatant.id;

  // External system: the device vibration motor (navigator.vibrate). Buzz once when it becomes your turn.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) navigator.vibrate?.(TURN_VIBRATION);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  if (!state || !codex) return <StatusScreen text="SYNCING…" />;
  if (!me) return <StatusScreen text="CHARACTER NOT FOUND. ASK YOUR GM." />;

  const names = new Map(state.characters.map((c) => [c.id, c.name]));
  const current = enc?.combatants.find((c) => c.id === enc.currentId);
  const currentName = current ? (current.kind === "pc" ? names.get(current.characterId) : current.label) : null;
  const next = sideUpNext(state);
  const banner = !enc ? "NO COMBAT · STANDING BY"
    : myTurn ? "▶ YOUR TURN"
    : `RND ${String(enc.round).padStart(2, "0")} · ${currentName ? `${currentName.toUpperCase()} ACTING` : `${(next ?? "—").toUpperCase()} PICK`}${myCombatant?.acted ? " · YOU: DONE" : ""}`;

  return (
    <div className="pl">
      {!online && <div className="badge-offline">NO SIGNAL</div>}
      <div className={`pl-banner ${myTurn ? "up" : ""}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="display" style={{ fontSize: 26, flex: 1 }}>{banner}</div>
        {/* Signed-in players get the lobby and account menu. Guests only get LEAVE, which forgets this phone's QR seat
            (plain <a>, so nothing prefetches it); rescanning the QR rejoins. */}
        <Show when="signed-in"><a href="/" aria-label="Lobby">◂</a><UserButton /></Show>
        <Show when="signed-out"><a className="btn sm" href="/leave">LEAVE</a></Show>
      </div>
      <div className="pl-body">
        {tab === "SHEET" && <Sheet me={me} state={state} send={send} />}
        {tab === "FIGHT" && <Fight state={state} />}
        {tab === "INTEL" && <Intel codex={codex} state={state} />}
      </div>
      <nav className="tabs" role="tablist" style={{ borderTop: "1px solid var(--line)", borderBottom: 0, position: "sticky", bottom: 0, background: "var(--bg)" }}>
        {PLAYER_TABS.map((t) => <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>[{t}]</button>)}
      </nav>
    </div>
  );
}
