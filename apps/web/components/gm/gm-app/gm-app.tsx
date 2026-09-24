"use client";
import { useState } from "react";

import { Pool, poolMax, type Threat } from "@wg/shared";

import { CodexView } from "@/components/gm/codex/codex";
import { Party } from "@/components/gm/party/party";
import { Prep } from "@/components/gm/prep/prep";
import { Tracker } from "@/components/gm/tracker/tracker";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { useTable } from "@/hooks/use-table/use-table";

import { GM_TABS, type GmTab } from "./constants";

type GmAppProps = { bestiary: Threat[] };

export function GmApp({ bestiary }: GmAppProps) {
  const { state, codex, online, send } = useTable();
  const [tab, setTab] = useState<GmTab>("TRACK");
  if (!state || !codex) return <StatusScreen text="SYNCING COGITATOR…" />;

  const players = state.characters.length;
  const pool = (p: Pool) => (
    <div key={p} className={`pool ${p === "ruin" ? "ruin" : ""}`}>
      <span className="label" style={{ color: "inherit" }}>{p}</span>
      <span className="display" style={{ fontSize: 30 }}>
        {String(state.campaign[p]).padStart(2, "0")}/{String(poolMax(p, players)).padStart(2, "0")}
      </span>
      <button className="btn sq" aria-label={`Spend ${p}`} onClick={() => send({ type: "pool.adjust", pool: p, delta: -1 })}>−</button>
      <button className="btn sq" aria-label={`Add ${p}`} onClick={() => send({ type: "pool.adjust", pool: p, delta: 1 })}>+</button>
    </div>
  );

  return (
    <div className="gm">
      {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
      <header className="gm-head">
        <div className="display gm-title">
          AUSPEX <span className="dim">// {state.campaign.name.toUpperCase()} // T{state.campaign.tier}</span>
        </div>
        {state.encounter && <div className="display" style={{ fontSize: 30 }}>RND {String(state.encounter.round).padStart(2, "0")}</div>}
        {Pool.options.map(pool)}
      </header>
      <nav className="tabs" role="tablist">
        {GM_TABS.map((t) => <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>[{t}]</button>)}
      </nav>
      <main className="gm-body">
        {tab === "TRACK" && <Tracker state={state} send={send} bestiary={bestiary} />}
        {tab === "PREP" && <Prep state={state} codex={codex} send={send} bestiary={bestiary} onRun={() => setTab("TRACK")} />}
        {tab === "CODEX" && <CodexView codex={codex} send={send} />}
        {tab === "PARTY" && <Party state={state} codex={codex} send={send} />}
      </main>
    </div>
  );
}
