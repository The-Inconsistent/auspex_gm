"use client";
import { useState } from "react";

import type { SetupStep } from "@/lib/setup/setup";

import { SETUP_GO_TO, type GoTo, type TabTarget } from "./constants";

type SetupPanelProps = { steps: SetupStep[]; onTab: (to: TabTarget) => void };

const isOptional = (s: SetupStep) => "optional" in s && s.optional;

// SETUP · BUILDING THE CAMPAIGN (issue #45): the Core Rulebook's set-up order, each step ticked from what the campaign
// already holds (lib/setup). It folds away by itself once every step that must tick has.
export function SetupPanel({ steps, onTab }: SetupPanelProps) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => s.done === false && !isOptional(s));
  const [folded, setFolded] = useState(!next);

  // GO TO: another tab, then the panel the step is done in (a field there also takes the focus). A new tab renders on
  // the next commit, so the scroll waits a frame for it.
  const goTo = (s: SetupStep) => {
    const { tab, kind, anchor }: GoTo = SETUP_GO_TO[s.key];
    if (tab) onTab({ tab, kind });
    if (!anchor) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(anchor);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
    });
  };

  const progress = `${done} OF ${steps.length} STEPS DONE`;
  return (
    <section className="panel pad stack">
      <div className="setup-head">
        <div className="rule">SETUP · BUILDING THE CAMPAIGN</div>
        <span className="label">{progress} · TICKS ARE READ, NEVER STORED</span>
        <span className="setup-bar" aria-hidden>
          {steps.map((s) => (
            <i key={s.key} className={s.done ? "on" : ""} />
          ))}
        </span>
        <button className="btn sm" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          {folded ? "SHOW STEPS" : "FOLD AWAY"}
        </button>
      </div>
      {!folded && (
        <div className="setup-scroll">
          <table className="setup">
            <thead>
              <tr>
                <th aria-label="Done" />
                <th>STEP</th>
                <th>BOOK</th>
                <th>NOW</th>
                <th>GO TO</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => {
                const isNext = s === next;
                return (
                  <tr key={s.key} className={isNext ? "next" : ""}>
                    <td>
                      <span
                        className={`setup-tick ${s.done ? "on" : ""}`}
                        role="img"
                        aria-label={s.done ? "Done" : "Not done"}
                      />
                    </td>
                    <td>
                      <div className="setup-step">
                        <span className="dim">{String(s.n).padStart(2, "0")}</span> <b>{s.title}</b>
                        {isOptional(s) && <span className="chip">OPTIONAL</span>}
                        {isNext && <span className="chip bad">NEXT</span>}
                      </div>
                      <div>{s.hint}</div>
                    </td>
                    <td className="setup-cite">{s.cite}</td>
                    <td className="label">{s.now}</td>
                    <td>
                      <button className={`btn sm ${isNext ? "primary" : ""}`} onClick={() => goTo(s)}>
                        {SETUP_GO_TO[s.key].label}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
