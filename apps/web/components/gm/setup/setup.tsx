"use client";
import { useState } from "react";

import type { ActionResult, Codex, FrameworkCatalogue, LiveState } from "@wg/shared";

import { TableTalk } from "@/components/ui/table-talk/table-talk";
import type { Send } from "@/hooks/use-table/use-table";
import { setupSteps } from "@/lib/setup/setup";

import { ArchivePanel } from "./components/archive-panel/archive-panel";
import { FrameworkPicker } from "./components/framework-picker/framework-picker";
import type { TabTarget } from "./components/setup-panel/constants";
import { SetupPanel } from "./components/setup-panel/setup-panel";

type SetupProps = {
  state: LiveState;
  codex: Codex;
  send: Send;
  frameworks: FrameworkCatalogue;
  onTab: (to: TabTarget) => void;
  onDeleted: () => void; // the game was deleted: leave its table
};

// SETUP: the Core Rulebook's campaign set-up checklist, then the campaign's own answers, the ones NEW CAMPAIGN asked
// first (the Framework, its Bonus, the patron, the kind of game and the limits), the campaign as a file, and ARCHIVE.
export function Setup({ state, codex, send, frameworks, onTab, onDeleted }: SetupProps) {
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [framework, setFramework] = useState(state.campaign.framework);
  const [frameworkBonus, setFrameworkBonus] = useState(state.campaign.frameworkBonus);
  const [patron, setPatron] = useState(state.campaign.patron);
  const [table, setTable] = useState({ kind: state.campaign.kind, limits: state.campaign.limits });

  const report = (r: ActionResult, ok: string) => setMsg(r.ok ? ok : `! ${r.error}`);

  // Framework SAVE.
  const saveFramework = async () =>
    report(await send({ type: "campaign.update", framework, frameworkBonus, patron, ...table }), "FRAMEWORK SAVED");

  // START FROM A FRAMEWORK › USE: the picked names go into the form, saved only by SAVE.
  const fillFramework = (picked: { patron: string; framework: string }) => {
    setPatron(picked.patron);
    setFramework(picked.framework);
    setPicking(false);
    setMsg("FRAMEWORK FILLED IN · SAVE TO KEEP IT");
  };

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}

      <SetupPanel steps={setupSteps({ campaign: state.campaign, codex, characters: state.characters })} onTab={onTab} />

      <section className="panel pad stack">
        <div className="rule">FRAMEWORK (p.18)</div>
        <div className="field">
          <label className="label" htmlFor="patron">
            PATRON
          </label>
          <input id="patron" className="input" value={patron} onChange={(e) => setPatron(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="fw">
            FRAMEWORK
          </label>
          <textarea id="fw" className="input" value={framework} onChange={(e) => setFramework(e.target.value)} />
        </div>
        {/* Its own box, as on the party sheet (Core p.374, rules-flow §11.80). Players see it under MISSION. */}
        <div className="field">
          <label className="label" htmlFor="fw-bonus">
            FRAMEWORK BONUS (p.19)
          </label>
          <textarea
            id="fw-bonus"
            className="input"
            value={frameworkBonus}
            onChange={(e) => setFrameworkBonus(e.target.value)}
          />
        </div>
        <TableTalk {...table} onChange={setTable} />
        <div className="keys">
          <button
            className={`btn ${picking ? "primary" : ""}`}
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
          >
            START FROM A FRAMEWORK
          </button>
          <button className="btn" onClick={saveFramework}>
            SAVE
          </button>
          {/* The whole campaign as a file, for a backup or the lobby's IMPORT GAME. */}
          <a className="btn" href={`/api/campaigns/${state.campaign.id}/export`} download>
            EXPORT
          </a>
        </div>
        <i className="dim">Typing your own still works.</i>
      </section>

      {picking && (
        <FrameworkPicker
          catalogue={frameworks}
          tier={state.campaign.tier}
          patron={patron}
          onUse={fillFramework}
          onClose={() => setPicking(false)}
        />
      )}

      <ArchivePanel campaign={state.campaign} send={send} onDeleted={onDeleted} />
    </div>
  );
}
