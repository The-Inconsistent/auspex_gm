"use client";
import { useMemo, useState } from "react";

import { UserButton } from "@wg/auth/react";
import {
  Pool,
  poolMax,
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
import { Party } from "@/components/gm/party/party";
import { Prep } from "@/components/gm/prep/prep";
import type { TabTarget } from "@/components/gm/setup/components/setup-panel/constants";
import { Setup } from "@/components/gm/setup/setup";
import { SpendRequests } from "@/components/gm/spend-requests/spend-requests";
import { Tracker } from "@/components/gm/tracker/tracker";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";
import { Seal } from "@/components/ui/seal/seal";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { RUIN_ACTIONS_TABLE } from "@/components/ui/threat-builder/constants";
import { useBookServer } from "@/hooks/use-book-server/use-book-server";
import { useTable } from "@/hooks/use-table/use-table";

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
  initialTab = "TRACK",
}: GmAppProps) {
  const { state, codex, online, send, books, requestPage, serveBooks } = useTable(campaignId);
  const bookServer = useBookServer(serveBooks);
  const [tab, setTab] = useState<GmTab>(initialTab);
  const [codexKind, setCodexKind] = useState<CodexKind>(); // the kind CODEX opens on, when SETUP sends it there
  const [poolError, setPoolError] = useState<string | null>(null);
  // The books' stat blocks plus the ones the GM wrote (issue #43), by name. Every picker, the NPC stat source and the
  // stat block already read this one list, so nothing else needs to know about customs. Above the early return, since
  // hooks run in the same order every render.
  const customs = codex?.customThreats;
  const allThreats = useMemo(
    () => [...bestiary, ...(customs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [bestiary, customs],
  );
  if (!state || !codex) return <StatusScreen text="SYNCING COGITATOR…" />;

  // SETUP's GO TO: opens a tab, and CODEX on the step's kind.
  const openTab = ({ tab: t, kind }: TabTarget) => {
    setCodexKind(kind);
    setTab(t);
  };

  const players = state.characters.length;

  // Pool − / +: moves Glory or Ruin by one; a refusal shows the server's reason.
  const adjustPool = async (p: Pool, delta: number) => {
    const r = await send({ type: "pool.adjust", pool: p, delta });
    setPoolError(r.ok ? null : r.error);
  };
  const pool = (p: Pool) => (
    <div key={p} className={`pool ${p}`}>
      <span className="label" style={{ color: "inherit" }}>
        {p}
      </span>
      <Seal value={state.campaign[p]} pool={p} size={40} />
      <span className="dim" style={{ fontSize: 15 }}>
        /{poolMax(p, players)}
      </span>
      <button className="btn sq" aria-label={`Spend ${p}`} onClick={() => adjustPool(p, -1)}>
        −
      </button>
      <button className="btn sq" aria-label={`Add ${p}`} onClick={() => adjustPool(p, 1)}>
        +
      </button>
    </div>
  );

  return (
    <BooksProvider books={books} requestPage={requestPage}>
      <RulesProvider rules={rules}>
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
            {Pool.options.map(pool)}
            <ThemeToggle />
            <UserButton />
          </header>
          <nav className="tabs rail" role="tablist" aria-label="GM sections">
            {GM_TABS.map((t, i) => (
              <button
                key={t}
                role="tab"
                className="tab"
                data-n={TAB_NUMERALS[i]}
                aria-selected={tab === t}
                onClick={() => openTab({ tab: t })}
              >
                {t}
              </button>
            ))}
          </nav>
          <SpendRequests state={state} send={send} />
          <main className="gm-body">
            {tab === "TRACK" && <Tracker state={state} send={send} bestiary={allThreats} />}
            {tab === "SETUP" && (
              <Setup state={state} codex={codex} send={send} frameworks={frameworks} onTab={openTab} />
            )}
            {tab === "PREP" && (
              <Prep
                state={state}
                codex={codex}
                send={send}
                bestiary={allThreats}
                presets={presets}
                wargear={wargear}
                onRun={() => setTab("TRACK")}
              />
            )}
            {tab === "CODEX" && (
              <CodexView
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
            {tab === "PARTY" && <Party state={state} codex={codex} send={send} wargear={wargear} />}
            {tab === "RULES" && <RulesRef rules={rules} />}
            {tab === "BOOKS" && <Books server={bookServer} />}
          </main>
          <Refusal error={poolError} onDismiss={() => setPoolError(null)} />
        </div>
      </RulesProvider>
    </BooksProvider>
  );
}
