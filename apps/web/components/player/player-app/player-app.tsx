"use client";
import { BookOpen, ChevronLeft, EllipsisVertical, RadioTower, ScrollText, Swords, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Show, UserButton } from "@wg/auth/react";
import { UNSEEN_ID, type RuleEntry } from "@wg/shared";

import { PlayerSheet } from "@/components/player/player-sheet/player-sheet";
import { TestPrompt } from "@/components/player/test-prompt/test-prompt";
import { WhisperSheet } from "@/components/player/whisper-sheet/whisper-sheet";
import { ArchivedBanner } from "@/components/ui/archived-banner/archived-banner";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { PictureProvider } from "@/components/ui/codex-picture/codex-picture";
import { MentionsProvider } from "@/components/ui/mentions/mentions-provider";
import { PendingSpends } from "@/components/ui/request-spend/request-spend";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { useSeen } from "@/hooks/use-seen/use-seen";
import { useTable } from "@/hooks/use-table/use-table";
import { freshCount } from "@/lib/seen/seen";

import { Fight } from "./components/fight/fight";
import { Intel } from "./components/intel/intel";
import { VitalsStrip } from "./components/vitals-strip/vitals-strip";
import { FOLD_UNDER_PX, PLAYER_TABS, TAB_PARAM, TURN_VIBRATION, type PlayerTab } from "./constants";

type PlayerAppProps = { campaignId: string; characterId: string; rules: RuleEntry[] };

const TAB_ICONS: Record<PlayerTab, LucideIcon> = {
  SHEET: ScrollText,
  FIGHT: Swords,
  INTEL: RadioTower,
  RULES: BookOpen,
};

export function PlayerApp({ campaignId, characterId, rules }: PlayerAppProps) {
  const { state, codex, online, send, books, requestPage } = useTable(campaignId);
  const params = useSearchParams();
  const tab = PLAYER_TABS.find((t) => t.toLowerCase() === params.get(TAB_PARAM)) ?? "SHEET";
  const [folded, setFolded] = useState(false);
  const { fresh, markSeen } = useSeen(campaignId, codex);
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

  // External system: the page scroll (IntersectionObserver). Once the marker near the top of the body slides under the
  // open header, the vitals strip folds to one line; the folded header is shorter, so it only opens again near the top.
  // A callback ref, since the marker only mounts after the first snapshot.
  const watchTop = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFolded(e ? !e.isIntersecting : false), {
      rootMargin: `-${FOLD_UNDER_PX}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A tab tap: the tab goes in the address, so a refresh keeps it. INTEL lists everything inline, so leaving it is what
  // marks what it showed as seen. The native history API updates useSearchParams without a server round trip.
  const handleTab = (t: PlayerTab) => {
    if (tab === "INTEL" && t !== "INTEL") markSeen();
    const q = new URLSearchParams(params.toString());
    q.set(TAB_PARAM, t.toLowerCase());
    window.history.replaceState(null, "", `?${q.toString()}`);
  };

  if (!state || !codex) return <StatusScreen text="SYNCING…" />;
  if (!me) return <StatusScreen text="CHARACTER NOT FOUND. ASK YOUR GM." />;

  const newCount = freshCount(codex, fresh);
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
  const round = enc ? `RND ${String(enc.round).padStart(2, "0")}` : "";
  const status = !enc
    ? "NO COMBAT · STANDING BY"
    : myTurn
      ? `▶ ${round} · YOUR TURN`
      : `${round} · ${currentName ? `${currentName.toUpperCase()} ACTING` : `${(next ?? "—").toUpperCase()} PICK`}${myCombatant?.acted ? " · YOU: DONE" : ""}`;

  return (
    <BooksProvider books={books} requestPage={requestPage}>
      <RulesProvider rules={rules}>
        <PictureProvider campaignId={campaignId}>
          <MentionsProvider codex={codex} missing="(unknown)">
            <div className="pl">
              <header className={`pl-head band torn slate-card ${myTurn ? "up" : ""}`}>
                {/* In the header, not fixed over it, so it never covers the menu or the account button. */}
                {!online && <div className="badge-offline">NO SIGNAL</div>}
                <div className="pl-top">
                  {/* Signed-in players also get the lobby and account menu. LEAVE gives up the seat: the Agent goes
                  back to reserve and the room QR offers it again; /leave then forgets a guest's cookie. */}
                  <Show when="signed-in">
                    <a href="/" className="pl-ic" aria-label="Back to lobby">
                      <ChevronLeft size={20} aria-hidden />
                    </a>
                  </Show>
                  <div className="pl-where">
                    <span className="label">{state.campaign.name.toUpperCase()}</span>
                    <span className="mono pl-status">{status}</span>
                  </div>
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                  <button type="button" className="pl-ic" popoverTarget="pl-menu" aria-label="Menu: theme, leave">
                    <EllipsisVertical size={20} aria-hidden />
                  </button>
                  <div id="pl-menu" popover="auto" className="pl-menu">
                    <ThemeToggle />
                    <button className="btn sm" onClick={leave}>
                      LEAVE
                    </button>
                  </div>
                </div>
                {myTurn && (
                  <div className="pl-turn">
                    <span className="display">YOUR TURN</span>
                    <i>{me.name} acts. The GM ends the Turn.</i>
                  </div>
                )}
                <VitalsStrip me={me} state={state} send={send} folded={folded} onOpenSheet={() => handleTab("SHEET")} />
              </header>
              <div className="pl-body">
                <div ref={watchTop} className="pl-fold-mark" aria-hidden />
                {state.campaign.archived && <ArchivedBanner text="THE GM HAS CLOSED THIS GAME. NOTHING CAN CHANGE." />}
                {/* On every tab, since a spend can be asked from the strip or FIGHT: yours to cancel, the others' Glory to see (§11.123). */}
                <PendingSpends state={state} characterId={me.id} send={send} />
                {state.testCall && (
                  <TestPrompt
                    key={state.testCall.id}
                    call={state.testCall}
                    me={me}
                    tier={state.campaign.tier}
                    send={send}
                  />
                )}
                {/* One bottom sheet at a time: a called Test first, a whisper once it closes. */}
                {!state.testCall && (
                  <WhisperSheet campaignId={campaignId} characterId={me.id} whispers={state.whispers} send={send} />
                )}
                {tab === "SHEET" && <PlayerSheet me={me} state={state} codex={codex} send={send} />}
                {tab === "FIGHT" && (
                  <Fight
                    state={state}
                    characterId={characterId}
                    send={send}
                    legend={rules.filter((r) => r.kind === "stat")}
                    actions={rules.filter((r) => r.kind === "action")}
                  />
                )}
                {tab === "INTEL" && (
                  <Intel
                    codex={codex}
                    state={state}
                    characterId={me.id}
                    send={send}
                    fresh={fresh}
                    markSeen={markSeen}
                  />
                )}
                {tab === "RULES" && <RulesRef rules={rules} />}
              </div>
              <nav className="pl-nav" role="tablist" aria-label="Player sections">
                {PLAYER_TABS.map((t) => {
                  const Icon = TAB_ICONS[t];
                  return (
                    <button
                      key={t}
                      role="tab"
                      className="pl-tab"
                      aria-selected={tab === t}
                      aria-label={
                        t === "INTEL" && newCount > 0
                          ? `INTEL, ${newCount} new`
                          : t === "FIGHT" && enc
                            ? "FIGHT, a fight is on"
                            : undefined
                      }
                      onClick={() => handleTab(t)}
                    >
                      <Icon size={20} aria-hidden />
                      <span>{t}</span>
                      {t === "FIGHT" && enc && <span className="pl-live" />}
                      {t === "INTEL" && newCount > 0 && <span className="mono pl-count">{newCount}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </MentionsProvider>
        </PictureProvider>
      </RulesProvider>
    </BooksProvider>
  );
}
