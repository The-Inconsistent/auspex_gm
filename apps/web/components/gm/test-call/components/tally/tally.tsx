"use client";
import { useState } from "react";

import {
  BLIGHTED_SOUL,
  corruptionGain,
  corruptionTestDn,
  dnLabel,
  hasMutation,
  isCorruptionDn,
  testTitle,
  type ActionResult,
  type Character,
  type TestCall,
  type TestReport,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type TallyProps = { call: TestCall; characters: Character[]; send: Send; onResult: (r: ActionResult) => void };

// The open call: one row per Agent asked, PENDING until their phone (or the GM) reports. A failed Fear or Corruption
// Test offers its Ruin (Core p.320), a failed Corruption Test its gain (p.286); each offer goes once it's taken. Keyed on
// the call, so a new call starts with none taken.
// ponytail: what's taken lives on this tablet only, so a reload offers it again; record it on the report if that bites.
export function Tally({ call, characters, send, onResult }: TallyProps) {
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); // an offer in flight: a second tap would apply it twice
  const byId = new Map(characters.map((c) => [c.id, c]));
  const fearOrCorruption = call.fear || call.test.kind === "corruption";

  // SET PASSED / SET FAILED: for a phone that's out (§11.144). The same answer again is left alone, so a failed
  // Corruption Test keeps the roll its phone sent.
  const handleSet = async (characterId: string, passed: boolean) => {
    if (call.reports[characterId]?.passed === passed) return;
    onResult(await send({ type: "test.report", callId: call.id, characterId, passed }));
  };

  // An offer taken: the action, then the offer goes for this call.
  const take = async (characterId: string, a: Parameters<Send>[0]) => {
    setBusy(true);
    const result = await send(a);
    setBusy(false);
    onResult(result);
    if (result.ok) setTaken((prev) => new Set(prev).add(characterId));
  };

  // GAIN n CORRUPTION: the failed Test as the phone reported it; character.corrupt adds its own +1 Ruin (§11.134).
  const handleGain = (c: Character, r: TestReport) => {
    if (!isCorruptionDn(call.test.dn)) return;
    const test = {
      source: call.test.dn,
      icons: r.icons ?? 0,
      complication: !!r.complication,
      wrathCritical: !!r.wrathCritical,
      spentWrath: !!r.spentWrath,
    };
    void take(c.id, { type: "character.corrupt", id: c.id, test });
  };

  // +1 RUIN: a failed Fear Test, or a Corruption Test reported without its roll (p.320).
  const handleRuin = (characterId: string) => void take(characterId, { type: "pool.adjust", pool: "ruin", delta: 1 });

  // CLOSE: the call is done.
  const handleClose = async () => onResult(await send({ type: "test.close" }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="display" style={{ flex: 1, minWidth: 220 }}>
          CALLED · {testTitle(call.test)} · {dnLabel(call.test)}
          {call.fear && " · FEAR"}
          {call.hideDn && " · DN HIDDEN"}
        </span>
        <button className="btn sm" onClick={handleClose}>
          CLOSE
        </button>
      </div>
      {call.who.map((id) => {
        const c = byId.get(id);
        if (!c) return null; // deleted since the call
        const r = call.reports[id];
        const offer = r && !r.passed && !taken.has(id);
        const gain =
          r && r.icons !== undefined && isCorruptionDn(call.test.dn)
            ? corruptionGain({
                dn: corruptionTestDn({
                  source: call.test.dn,
                  points: c.stats.corruption,
                  blighted: hasMutation(c.stats, BLIGHTED_SOUL),
                  ...r,
                }),
                icons: r.icons,
                complication: !!r.complication,
              })
            : null;
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 160 }}>
              {c.name.toUpperCase()} ·{" "}
              <span className={`chip ${r && !r.passed ? "bad" : ""}`}>
                {!r ? "PENDING" : r.passed ? "PASSED" : "FAILED"}
              </span>
              {r?.icons !== undefined && ` ${r.icons} ICONS${r.complication ? " · COMPLICATION" : ""}`}
            </span>
            <button className="btn sm" aria-label={`Set ${c.name} passed`} onClick={() => handleSet(id, true)}>
              SET PASSED
            </button>
            <button className="btn sm" aria-label={`Set ${c.name} failed`} onClick={() => handleSet(id, false)}>
              SET FAILED
            </button>
            {offer && gain !== null && (
              <button className="btn sm danger" disabled={busy} onClick={() => handleGain(c, r)}>
                GAIN {gain} CORRUPTION · +1 RUIN
              </button>
            )}
            {offer && gain === null && fearOrCorruption && (
              <button className="btn sm danger" disabled={busy} onClick={() => handleRuin(id)}>
                +1 RUIN
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
