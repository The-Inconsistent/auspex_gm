"use client";
import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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

import { CodexEditor } from "@/components/gm/codex/components/codex-editor/codex-editor";
import { CallTestButton } from "@/components/gm/header/call-test-button/call-test-button";
import { WhisperButton } from "@/components/gm/header/whisper-button/whisper-button";
import { SealButton } from "@/components/gm/header/seal-button/seal-button";
import { SpendBadge } from "@/components/gm/header/spend-badge/spend-badge";
import { TestCall } from "@/components/gm/test-call/test-call";
import { ArchivedBanner } from "@/components/ui/archived-banner/archived-banner";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { PictureProvider } from "@/components/ui/codex-picture/codex-picture";
import { MentionsProvider, type MentionEntry } from "@/components/ui/mentions/mentions-provider";
import { PrintProvider } from "@/components/ui/print-dialog/print-dialog";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { useBookServer } from "@/hooks/use-book-server/use-book-server";
import { useTable } from "@/hooks/use-table/use-table";
import { revealAnchor } from "@/lib/anchor/anchor";
import { gmPath } from "@/lib/gm-path/gm-path";
import type { Begun } from "@/lib/scene-reveal/scene-reveal";

import { asGmTab, GM_TABS, TAB_NUMERALS, type GmTab } from "./constants";
import { GmContext, type Gm } from "./gm-context";

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
  children: ReactNode; // the route: a tab, an entry or an editor (app/c/[campaignId]/(table)/)
};

// The GM tablet's shell, mounted once by the (table) layout: the socket, the header, the rail and the providers. The
// route below it picks the tab and what is open there, so every screen has a URL; the shell outlives them all.
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
  children,
}: GmAppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tab = asGmTab(useSelectedLayoutSegment()); // none on /c/<id> itself, which redirects
  const { state, codex, journal, online, send, books, requestPage, serveBooks } = useTable(campaignId);
  const bookServer = useBookServer(serveBooks);
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
  const synced = !!state && !!codex;
  // A GO TO with an anchor (SETUP's `/party#ascend`): Next scrolls to it, but a fold must open and a field take focus.
  // Also once the snapshots arrive, for a refreshed or bookmarked link whose target wasn't drawn yet. External system:
  // the DOM. The anchors are plain ids (SETUP_GO_TO), so the hash is used as it is, never decoded.
  useEffect(() => {
    if (synced && location.hash) revealAnchor(location.hash.slice(1));
  }, [pathname, synced]);
  // What the routes read (useGm), one object while nothing changed. Null until both snapshots arrive.
  const gm = useMemo<Gm | null>(
    () =>
      state && codex
        ? {
            campaignId,
            state,
            codex,
            journal,
            send,
            bestiary: allThreats,
            wargear,
            rules,
            presets,
            frameworks,
            factionPresets,
            npcPresets,
            flavour,
            places,
            bookServer,
            begun,
            setBegun,
            // DELETE GAME's ack: the server kicks the whole room a moment later, our socket included. That disconnect
            // is expected, so leave for the lobby now (which closes the socket) instead of showing NO SIGNAL.
            onDeleted: () => {
              setDeleted(true);
              router.push("/");
            },
          }
        : null,
    [
      campaignId,
      state,
      codex,
      journal,
      send,
      allThreats,
      wargear,
      rules,
      presets,
      frameworks,
      factionPresets,
      npcPresets,
      flavour,
      places,
      bookServer,
      begun,
      router,
    ],
  );
  if (deleted) return <StatusScreen text="GAME DELETED · BACK TO THE LOBBY…" />;
  if (!state || !codex || !gm) return <StatusScreen text="SYNCING COGITATOR…" />;

  // A peek's GO TO (issue #198): the entry's own URL, a scene's page in STORY or the row opened in CODEX. Like a tab
  // tap, it leaves whatever was open there.
  const goTo = ({ kind, id }: MentionEntry) => {
    if (kind !== "scene") return router.push(gmPath.codex({ campaignId, kind, entryId: id }));
    const adventure = codex.adventures.find((a) => a.beats.some((b) => b.id === id));
    router.push(gmPath.story({ campaignId, adventureId: adventure?.id, sceneId: adventure && id }));
  };

  // A peek's EDIT: the entry's CODEX form, in the peek, wherever the GM tapped the name (STORY, SCENE, a mention).
  const editor = (entry: MentionEntry, done: () => void) =>
    entry.kind !== "scene" && (
      <CodexEditor
        key={`${entry.kind}:${entry.id}`}
        kind={entry.kind}
        codex={codex}
        characters={state.characters}
        send={send}
        row={{ ...entry.row, id: entry.id }}
        keywords={factionPresets.keywords}
        bestiary={allThreats}
        tier={state.campaign.tier}
        flavour={flavour}
        hazards={presets.hazards}
        wargear={wargear}
        onDone={done}
        sheet={{ codexHref: gmPath.codex({ campaignId, kind: entry.kind, entryId: entry.id, edit: true }) }}
      />
    );

  // A rail tab's URL. SCENE opens on its fight while one is live, unless the GM is already on SCENE (its own switch
  // picks the layer there).
  const tabHref = (t: GmTab) =>
    t === "SCENE" ? gmPath.scene(campaignId, tab !== "SCENE" && !!state.encounter) : gmPath.tab(campaignId, t);

  return (
    <GmContext value={gm}>
      <BooksProvider books={books} requestPage={requestPage}>
        <RulesProvider rules={rules}>
          <PrintProvider source={{ state, codex, threats: allThreats, wargear }}>
            <PictureProvider campaignId={campaignId}>
              <MentionsProvider codex={codex} missing="(removed)" onGoTo={goTo} editor={editor}>
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
                    <WhisperButton state={state} send={send} />
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
                  <nav className="tabs rail" aria-label="GM sections">
                    {GM_TABS.map((t, i) => (
                      <Link
                        key={t}
                        href={tabHref(t)}
                        className={t === "SETUP" ? "tab foot" : "tab"}
                        data-n={TAB_NUMERALS[i]}
                        aria-current={tab === t ? "page" : undefined}
                      >
                        {t}
                      </Link>
                    ))}
                  </nav>
                  <TestCall state={state} send={send} />
                  <main className="gm-body" key={tab /* a new tab starts at its top */}>
                    {state.campaign.archived && (
                      <ArchivedBanner text="READ ONLY. UNARCHIVE IT IN SETUP TO PLAY ON.">
                        <Link className="btn sm" href={gmPath.tab(campaignId, "SETUP")}>
                          OPEN SETUP
                        </Link>
                      </ArchivedBanner>
                    )}
                    {children}
                  </main>
                  <Refusal error={poolError} onDismiss={() => setPoolError(null)} />
                </div>
              </MentionsProvider>
            </PictureProvider>
          </PrintProvider>
        </RulesProvider>
      </BooksProvider>
    </GmContext>
  );
}
