"use client";
import { useEffect, useRef, useState } from "react";

import { Show, UserButton } from "@wg/auth/react";
import { UNSEEN_ID, type RuleEntry } from "@wg/shared";

import { RequestSpend } from "@/components/player/request-spend/request-spend";
import { TestPrompt } from "@/components/player/test-prompt/test-prompt";
import { ArchivedBanner } from "@/components/ui/archived-banner/archived-banner";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { PictureProvider } from "@/components/ui/codex-picture/codex-picture";
import { MentionsProvider } from "@/components/ui/mentions/mentions-provider";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";
import { Sheet } from "@/components/ui/sheet/sheet";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { TurnActions } from "@/components/ui/turn-actions/turn-actions";
import { useTable } from "@/hooks/use-table/use-table";

import { Fight } from "./components/fight/fight";
import { Intel } from "./components/intel/intel";
import { PLAYER_TABS, TURN_VIBRATION, type PlayerTab } from "./constants";

type PlayerAppProps = { campaignId: string; characterId: string; rules: RuleEntry[] };

export function PlayerApp({ campaignId, characterId, rules }: PlayerAppProps) {
  const { state, codex, online, send, books, requestPage } = useTable(campaignId);

  const [tab, setTab] = useState<PlayerTab>("SHEET");
  const me = state?.characters.find((c) => c.id === characterId);
  const enc = state?.encounter ?? null;
  const myCombatant = enc?.combatants.find((c) => c.kind === "pc" && c.characterId === characterId);
  const myTurn = !!enc && !!myCombatant && enc.currentId === myCombatant.id;
  // LEAVE: give the seat back first, then /leave drops a guest cookie and goes home.
  const leave = async () => {
    if (!window.confirm(`Leave ${me?.name ?? "this seat"}? Another player can then pick this Agent.`)) return;
    const r = await send({ type: "seat.leave" });
    // /leave is a route handler that expires the httpOnly cookie, so it needs a full navigation, not a router push.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (r.ok) window.location.href = "/leave";
  };

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
  const currentName = current
    ? current.kind === "pc"
      ? names.get(current.characterId)
      : current.label
    : enc?.currentId === UNSEEN_ID
      ? "Unseen threat" // a hidden threat taking its Turn (§11.56)
      : null;
  // Worked out before hidden threats were dropped from this view; sideUpNext here would miss their Turns.
  const next = enc?.upNext ?? null;
  const banner = !enc
    ? "NO COMBAT · STANDING BY"
    : myTurn
      ? "▶ YOUR TURN"
      : `RND ${String(enc.round).padStart(2, "0")} · ${currentName ? `${currentName.toUpperCase()} ACTING` : `${(next ?? "—").toUpperCase()} PICK`}${myCombatant?.acted ? " · YOU: DONE" : ""}`;

  return (
    <BooksProvider books={books} requestPage={requestPage}>
      <RulesProvider rules={rules}>
        <PictureProvider campaignId={campaignId}>
          <MentionsProvider codex={codex} missing="(unknown)">
            <div className="pl">
              <div className={`pl-banner band torn ${myTurn ? "up" : ""}`}>
                {/* In the banner, not fixed over it, so it never covers LEAVE or the account button. */}
                {!online && <div className="badge-offline">NO SIGNAL</div>}
                {/* Signed-in players also get the lobby and account menu. LEAVE gives up the seat: the Agent goes back to
            reserve and the room QR offers it again; /leave then forgets a guest's cookie. */}
                <Show when="signed-in">
                  <a href="/" className="btn sq" aria-label="Back to lobby">
                    ◂
                  </a>
                </Show>
                <div className="pl-banner-text">
                  <div className="label">{state.campaign.name.toUpperCase()}</div>
                  <div className="display">{banner}</div>
                </div>
                <ThemeToggle />
                <Show when="signed-in">
                  <UserButton />
                </Show>
                <button className="btn sm" onClick={leave}>
                  LEAVE
                </button>
              </div>
              <div className="pl-body">
                {state.campaign.archived && <ArchivedBanner text="THE GM HAS CLOSED THIS GAME. NOTHING CAN CHANGE." />}
                {myTurn && <TurnActions />}
                {state.testCall && (
                  <TestPrompt
                    key={state.testCall.id}
                    call={state.testCall}
                    me={me}
                    tier={state.campaign.tier}
                    send={send}
                  />
                )}
                {tab === "SHEET" && <RequestSpend state={state} characterId={characterId} send={send} />}
                {tab === "SHEET" && <Sheet me={me} tier={state.campaign.tier} table={{ state, send }} />}
                {tab === "FIGHT" && <Fight state={state} legend={rules.filter((r) => r.kind === "stat")} />}
                {tab === "INTEL" && <Intel codex={codex} state={state} />}
                {tab === "RULES" && <RulesRef rules={rules} />}
              </div>
              <nav className="tabs pl-tabs" role="tablist">
                {PLAYER_TABS.map((t) => (
                  <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </nav>
            </div>
          </MentionsProvider>
        </PictureProvider>
      </RulesProvider>
    </BooksProvider>
  );
}
