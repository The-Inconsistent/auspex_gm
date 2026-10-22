"use client";
import { useState } from "react";

import { dnLabel, isCorruptionDn, testTitle, type BeatTest, type Character } from "@wg/shared";

import { ruinOnFailure } from "@/components/gm/prep/utils";
import { TestOutcomes } from "@/components/ui/test-outcomes/test-outcomes";
import type { Send } from "@/hooks/use-table/use-table";

import type { Report } from "../../types";

type TestRowsProps = {
  tests: BeatTest[];
  characters: Character[]; // for a Corruption Test's record
  agents: Character[]; // those holding a seat, for CALL
  send: Send;
  onReport: Report;
};

// A scene's prepared Tests, one tap each to call it to the phones (issue #191): an EACH Test asks every seated Agent, a
// ONE Test asks which Agent with a row of chips (one seated Agent needs no asking). Only what it rolls is sent; Shifts and
// outcomes stay the GM's (rules-flow.md §11.143), in a fold under the row. A Resolve Test has FEAR beside it: Terror earns no Ruin (Core p.199).
export function TestRows({ tests, characters, agents, send, onReport }: TestRowsProps) {
  const [asking, setAsking] = useState<number | null>(null); // the ONE Test waiting for its Agent
  const [fear, setFear] = useState<ReadonlySet<number>>(new Set());

  // Sends the call; it replaces any open one.
  const call = async ({ test, who, index }: { test: BeatTest; who: Character[]; index: number }) => {
    setAsking(null);
    const r = await send({ type: "test.call", test, who: who.map((c) => c.id), fear: fear.has(index) });
    onReport(r, `CALLED · ${testTitle(test)}`);
  };

  // The row: EACH calls everyone, ONE calls the lone Agent or opens the chips.
  const tap = (test: BeatTest, index: number) => {
    if (test.who === "each" || agents.length === 1) return call({ test, who: agents, index });
    setAsking(asking === index ? null : index);
  };

  // FEAR: flips the Terror / Fear flag of one Resolve Test.
  const toggleFear = (index: number) =>
    setFear((f) => (f.has(index) ? new Set([...f].filter((x) => x !== index)) : new Set([...f, index])));

  return (
    <div className="scene-tests">
      {tests.map((t, i) => {
        const title = testTitle(t);
        const ruin = ruinOnFailure(t);
        const corruptionDn = t.kind === "corruption" && isCorruptionDn(t.dn) && characters.length > 0 ? t.dn : null;
        return (
          <div key={i} className="scene-test">
            <div className="scene-test-line">
              <button
                type="button"
                className="scene-test-row"
                disabled={!agents.length}
                aria-expanded={t.who === "one" && agents.length > 1 ? asking === i : undefined}
                aria-label={`Call ${title}, ${dnLabel(t)}${t.who === "each" ? ", every Agent" : ""}${t.purpose ? `: ${t.purpose}` : ""}`}
                onClick={() => tap(t, i)}
              >
                <b>{title}</b>
                <span className="chip">{dnLabel(t)}</span>
                <span className="scene-test-why">{t.purpose}</span>
                <span className="scene-go">{t.who === "each" ? "CALL ALL ›" : asking === i ? "WHO? ›" : "CALL ›"}</span>
              </button>
              {t.kind === "resolve" && (
                <button type="button" className="btn sm" aria-pressed={fear.has(i)} onClick={() => toggleFear(i)}>
                  FEAR
                </button>
              )}
            </div>
            {(t.shifts.length > 0 || t.onSuccess || t.onFailure || ruin || corruptionDn) && (
              <details className="scene-test-more">
                <summary>
                  <span className="label">SHIFTS &amp; OUTCOMES</span>{" "}
                  {t.shifts.length > 0 && (
                    <span className="dim">
                      {t.shifts.length} SHIFT{t.shifts.length > 1 ? "S" : ""}
                    </span>
                  )}{" "}
                  {ruin && <span className="chip warn">{ruin}</span>}
                </summary>
                <div className="stack">
                  <TestOutcomes test={t} characters={characters} send={send} onReport={onReport} />
                </div>
              </details>
            )}
            {asking === i && (
              <div className="scene-who" role="group" aria-label={`Who rolls ${title}`}>
                <span className="label">WHO</span>
                {agents.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn sm"
                    aria-label={`Call ${title} for ${c.name}`}
                    onClick={() => call({ test: t, who: [c], index: i })}
                  >
                    {c.name.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!agents.length && <div className="dim">No Agent holds a seat yet, so there is no phone to call.</div>}
    </div>
  );
}
