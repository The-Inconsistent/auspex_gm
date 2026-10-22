"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { UserButton } from "@wg/auth/react";
import {
  Pool,
  type FactionPresets,
  type FlavourTable,
  type NpcPreset,
  type PlaceSummary,
  type FrameworkCatalogue,
  type RuleEntry,
  type ScenePresets,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { Books } from "@/components/gm/books/books";
import { CodexView } from "@/components/gm/codex/codex";
import type { CodexKind } from "@/components/gm/codex/constants";
import { CallTestButton } from "@/components/gm/header/call-test-button/call-test-button";
import { SealButton } from "@/components/gm/header/seal-button/seal-button";
import { SpendBadge } from "@/components/gm/header/spend-badge/spend-badge";
import { Party } from "@/components/gm/party/party";
import { Scene } from "@/components/gm/scene/scene";
import type { TabTarget } from "@/components/gm/setup/components/setup-panel/constants";
import { Setup } from "@/components/gm/setup/setup";
import { Story } from "@/components/gm/story/story";
import { TestCall } from "@/components/gm/test-call/test-call";
import { ArchivedBanner } from "@/components/ui/archived-banner/archived-banner";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { PictureProvider } from "@/components/ui/codex-picture/codex-picture";
import { MentionsProvider, type MentionEntry } from "@/components/ui/mentions/mentions-provider";
import { PrintProvider } from "@/components/ui/print-dialog/print-dialog";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { RUIN_ACTIONS_TABLE } from "@/components/ui/threat-builder/constants";
import { useBookServer } from "@/hooks/use-book-server/use-book-server";
import { useTable } from "@/hooks/use-table/use-table";
import type { Begun } from "@/lib/scene-reveal/scene-reveal";

import { GM_TABS, TAB_NUMERALS, type GmTab } from "./constants";

type GmAppProps = {
  campaignId: string;
  bestiary: Threat[];
  wargear: Wargear[];
  rules: RuleEntry[];
  presets: ScenePresets;
  frameworks: FrameworkCatalogue;
  factionPresets: FactionPresets;
  npcPresets: NpcPreset[];
  flavour: FlavourTable[];
  places: PlaceSummary[];
  admin: boolean; // a Clerk admin acting as GM without a seat
  initialTab?: GmTab;
};

export function GmApp({
  campaignId,
  bestiary,
  wargear,
  rules,
  presets,
  frameworks,
  factionPresets,
  npcPresets,
  flavour,
  places,
  admin,
  initialTab,
}: GmAppProps) {
  const router = useRouter();
  const { state, codex, online, send, books, requestPage, serveBooks } = useTable(campaignId);
  const bookServer = useBookServer(serveBooks);
  const [picked, setTab] = useState<GmTab | undefined>(initialTab); // none yet: SCENE in a session, else STORY
  const [codexKind, setCodexKind] = useState<CodexKind>(); // the kind CODEX opens on, when SETUP sends it there
  const [sceneId, setSceneId] = useState<string>(); // the scene STORY opens on, after a peek's GO TO or SCENE's EDIT
  const [visit, setVisit] = useState(0); // bumped by GO TO, so the target tab remounts on the entry
  const [poolError, setPoolError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false); // DELETE GAME went through: the server drops the room next
  const [begun, setBegun] = useState<Begun | null>(null); // the last scene begin, for SCENE's notice and UNDO, from SCENE or STORY
  // The books' stat blocks plus the ones the GM wrote (issue #43), by name. Every picker, the NPC stat source and the
  // stat block already read this one list, so nothing else needs to know about customs. Above the early return, since
  // hooks run in the same order every render.
  const customs = codex?.customThreats;
  const allThreats = useMemo(
    () => [...bestiary, ...(customs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [bestiary, customs],
  );
  if (deleted) return <StatusScreen text="GAME DELETED · BACK TO THE LOBBY…" />;
  if (!state || !codex) return <StatusScreen text="SYNCING COGITATOR…" />;
  const tab = picked ?? (codex.sessions.some((s) => !s.endedAt) ? "SCENE" : "STORY");

  // SETUP's GO TO: opens a tab, and CODEX on the step's kind.
  const openTab = ({ tab: t, kind }: TabTarget) => {
    setCodexKind(kind);
    setSceneId(undefined);
    setTab(t);
  };

  // A peek's GO TO (issue #198): the entry's tab, remounted on it (CODEX on its kind with the search cleared and the
  // places unfolded, STORY on the scene's page), then its row opened and scrolled to once it's drawn. Like a tab tap,
  // it leaves whatever was open there (an editor, PRINT ticks): showing the row means closing the editor.
  const goTo = ({ kind, id }: MentionEntry) => {
    if (kind === "scene") {
      openTab({ tab: "STORY" });
      setSceneId(id);
    } else openTab({ tab: "CODEX", kind });
    setVisit((v) => v + 1);
    requestAnimationFrame(() => {
      const el = document.getElementById(`entry-${id}`);
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ behavior: "smooth", block: "start" }); // start: a long row's title stays on screen
    });
  };

  // DELETE GAME's ack: the server kicks the whole room a moment later, our socket included. That disconnect is
  // expected, so leave for the lobby now (which closes the socket) instead of showing NO SIGNAL.
  const handleDeleted = () => {
    setDeleted(true);
    router.push("/");
  };

  const players = state.characters.length;

  // STORY's RUN: SCENE opens on the scene just begun, with its notice and UNDO (none when it was already being played).
  const runScene = (b: Begun | null) => {
    if (b) setBegun(b);
    setTab("SCENE");
  };

  // SCENE's EDIT: the scene's page in STORY.
  const editScene = (id: string) => {
    openTab({ tab: "STORY" });
    setSceneId(id);
    setVisit((v) => v + 1);
  };

  return (
    <BooksProvider books={books} requestPage={requestPage}>
      <RulesProvider rules={rules}>
        <PrintProvider source={{ state, codex, threats: allThreats, wargear }}>
          <PictureProvider campaignId={campaignId}>
            <MentionsProvider codex={codex} missing="(removed)" onGoTo={goTo}>
              <div className="gm">
                <header className="gm-head band torn">
                  {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
                  <a href="/" aria-label="Back to lobby" className="btn sq">
                    ◂
                  </a>
                  <div className="display gm-title">
                    AUSPEX{" "}
                    <span className="dim">
                      · {state.campaign.name.toUpperCase()} · T{state.campaign.tier}
                    </span>
                  </div>
                  {state.encounter && (
                    <div className="display page-title">RND {String(state.encounter.round).padStart(2, "0")}</div>
                  )}
                  <SpendBadge state={state} send={send} />
                  <CallTestButton state={state} send={send} />
                  {Pool.options.map((p) => (
                    <SealButton key={p} pool={p} state={state} codex={codex} send={send} onError={setPoolError} />
                  ))}
                  {admin && (
                    <span className="chip bad" aria-label="Signed in as an admin, acting as GM">
                      ADMIN
                    </span>
                  )}
                  <ThemeToggle />
                  <UserButton />
                </header>
                <nav className="tabs rail" role="tablist" aria-label="GM sections">
                  {GM_TABS.map((t, i) => (
                    <button
                      key={t}
                      role="tab"
                      className={t === "SETUP" ? "tab foot" : "tab"}
                      data-n={TAB_NUMERALS[i]}
                      aria-selected={tab === t}
                      onClick={() => openTab({ tab: t })}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                <TestCall state={state} send={send} />
                <main className="gm-body" key={tab /* a new tab starts at its top */}>
                  {state.campaign.archived && (
                    <ArchivedBanner text="READ ONLY. UNARCHIVE IT IN SETUP TO PLAY ON.">
                      <button className="btn sm" onClick={() => openTab({ tab: "SETUP" })}>
                        OPEN SETUP
                      </button>
                    </ArchivedBanner>
                  )}
                  {tab === "SCENE" && (
                    <Scene
                      state={state}
                      codex={codex}
                      send={send}
                      bestiary={allThreats}
                      presets={presets}
                      onEdit={editScene}
                      notice={begun}
                      onNotice={setBegun}
                    />
                  )}
                  {tab === "SETUP" && (
                    <Setup
                      state={state}
                      codex={codex}
                      send={send}
                      frameworks={frameworks}
                      onTab={openTab}
                      onDeleted={handleDeleted}
                    />
                  )}
                  {tab === "STORY" && (
                    <Story
                      key={visit}
                      initialSceneId={sceneId}
                      state={state}
                      codex={codex}
                      send={send}
                      bestiary={allThreats}
                      presets={presets}
                      wargear={wargear}
                      onRun={runScene}
                    />
                  )}
                  {tab === "CODEX" && (
                    <CodexView
                      key={visit}
                      codex={codex}
                      characters={state.characters}
                      send={send}
                      initialKind={codexKind}
                      factionPresets={factionPresets}
                      npcPresets={npcPresets}
                      flavour={flavour}
                      places={places}
                      hazards={presets.hazards}
                      spaceHulk={presets.spaceHulk}
                      ruinActions={presets.pools.find((t) => t.id === RUIN_ACTIONS_TABLE) ?? null}
                      bestiary={allThreats}
                      tier={state.campaign.tier}
                      players={players}
                      wargear={wargear}
                      loot={presets.loot}
                      relics={presets.relics}
                    />
                  )}
                  {tab === "PARTY" && (
                    <Party state={state} codex={codex} send={send} wargear={wargear} mutations={presets.mutations} />
                  )}
                  {tab === "RULES" && <RulesRef rules={rules} />}
                  {tab === "BOOKS" && <Books server={bookServer} />}
                </main>
                <Refusal error={poolError} onDismiss={() => setPoolError(null)} />
              </div>
            </MentionsProvider>
          </PictureProvider>
        </PrintProvider>
      </RulesProvider>
    </BooksProvider>
  );
}
