"use client";
import { useState } from "react";

import { UserButton } from "@wg/auth/react";
import {
  Pool,
  poolMax,
  type FactionPresets,
  type FrameworkCatalogue,
  type RuleEntry,
  type ScenePresets,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { Books } from "@/components/gm/books/books";
import { CodexView } from "@/components/gm/codex/codex";
import type { CodexKind } from "@/components/gm/codex/constants";
import type { TabTarget } from "@/components/gm/party/components/setup-panel/constants";
import { Party } from "@/components/gm/party/party";
import { Prep } from "@/components/gm/prep/prep";
import { Tracker } from "@/components/gm/tracker/tracker";
import { BooksProvider } from "@/components/ui/books-provider/books-provider";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";
import { Seal } from "@/components/ui/seal/seal";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
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
};

export function GmApp({ campaignId, bestiary, wargear, rules, presets, frameworks, factionPresets }: GmAppProps) {
  const { state, codex, online, send, books, requestPage, serveBooks } = useTable(campaignId);
  const bookServer = useBookServer(serveBooks);
  const [tab, setTab] = useState<GmTab>("TRACK");
  const [codexKind, setCodexKind] = useState<CodexKind>(); // the kind CODEX opens on, when PARTY's SETUP sends it there
  const [poolError, setPoolError] = useState<string | null>(null);
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
          {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
          <header className="gm-head band torn">
            <a href="/" aria-label="Lobby" className="display" style={{ fontSize: 30, textDecoration: "none" }}>
              ◂
            </a>
            <div className="display gm-title">
              AUSPEX{" "}
              <span className="dim">
                · {state.campaign.name.toUpperCase()} · T{state.campaign.tier}
              </span>
            </div>
            {state.encounter && (
              <div className="display" style={{ fontSize: 30 }}>
                RND {String(state.encounter.round).padStart(2, "0")}
              </div>
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
          <main className="gm-body">
            {tab === "TRACK" && <Tracker state={state} send={send} bestiary={bestiary} />}
            {tab === "PREP" && (
              <Prep
                state={state}
                codex={codex}
                send={send}
                bestiary={bestiary}
                presets={presets}
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
                bestiary={bestiary}
                tier={state.campaign.tier}
                players={players}
              />
            )}
            {tab === "PARTY" && (
              <Party
                state={state}
                codex={codex}
                send={send}
                wargear={wargear}
                frameworks={frameworks}
                onTab={openTab}
              />
            )}
            {tab === "RULES" && <RulesRef rules={rules} />}
            {tab === "BOOKS" && <Books server={bookServer} />}
          </main>
          <Refusal error={poolError} onDismiss={() => setPoolError(null)} />
        </div>
      </RulesProvider>
    </BooksProvider>
  );
}
