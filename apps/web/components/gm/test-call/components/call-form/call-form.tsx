"use client";
import { useState, type ChangeEvent } from "react";

import {
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  CORRUPTION_DNS,
  DN_TABLE,
  SKILLS,
  TEST_KIND_LABELS,
  TEST_POOL,
  TestKind,
  dnLabel,
  isCorruptionDn,
  retypeTest,
  testTitle,
  type ActionResult,
  type BeatTest,
  type Character,
} from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import type { Send } from "@/hooks/use-table/use-table";

import { NEW_CALL, SKILL_NAMES } from "../../constants";

type CallFormProps = { agents: Character[]; send: Send; onResult: (r: ActionResult) => void };

// CALL A TEST: what it rolls, its DN, and who rolls it. Collapsed until wanted, so it costs the tablet one line. A tapped
// name picks that Agent, as the scene's chips do (a GM who tapped names here once took them out and their phones got
// nothing); ALL picks every seated Agent. Only seated Agents are offered, so one who leaves drops out of the pick.
export function CallForm({ agents, send, onResult }: CallFormProps) {
  const [test, setTest] = useState<BeatTest>(NEW_CALL);
  const [fear, setFear] = useState(false);
  const [hideDn, setHideDn] = useState(false);
  // A lone seated Agent needs no picking (as the scene's ONE Test).
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(agents.length === 1 ? [agents[0]!.id] : []));
  const who = agents.filter((c) => picked.has(c.id)).map((c) => c.id);
  const pool = TEST_POOL[test.kind];
  const corruption = test.kind === "corruption";
  const table: readonly number[] = corruption ? CORRUPTION_DNS : DN_TABLE.map((r) => r.dn);
  // A DN typed in the box that the table doesn't print still needs its option, or the select shows another.
  const dns = test.dn === null || table.includes(test.dn) ? table : [...table, test.dn].sort((a, b) => a - b);

  // KIND: keep what still fits (retypeTest); a Corruption DN is one p.285 prints; a Fear mark only stays on a Resolve
  // Test (Core p.199).
  const handleKind = (e: ChangeEvent<HTMLSelectElement>) => {
    const kind = TestKind.parse(e.target.value);
    const next = retypeTest(test, kind);
    setTest(kind === "corruption" && !isCorruptionDn(next.dn) ? { ...next, dn: 3 } : next);
    if (kind !== "resolve") setFear(false);
  };

  // SKILL or ATTRIBUTE: an Opposed Test rolls either, so picking one clears the other.
  const handlePool = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const skill = SKILL_NAMES.find((s) => s === v) ?? null;
    setTest({ ...test, skill, attribute: skill ? null : (ATTRIBUTES.find((a) => a === v) ?? null) });
  };

  // DN: one of the table's (p.161), or of p.285 for Corruption.
  const handleDn = (e: ChangeEvent<HTMLSelectElement>) => setTest({ ...test, dn: Number(e.target.value) });

  // DN typed: any from 1 to 20 (the schema's cap), as the scene editor allows; an emptied box keeps the last DN.
  const handleDnTyped = (dn: number | null) => setTest({ ...test, dn: dn ?? test.dn });

  // An Agent in or out of the call.
  const handleWho = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };

  // ALL: every seated Agent rolls.
  const handleAll = () => setPicked(new Set(agents.map((c) => c.id)));

  // CALL: replaces any open call (§11.143).
  const handleCall = async () => onResult(await send({ type: "test.call", test, who, fear, hideDn }));

  if (!agents.length) return <span className="dim">CALL A TEST: no Agent holds a seat yet.</span>;
  return (
    <details>
      <summary className="display">CALL A TEST</summary>
      <div className="keys" style={{ alignItems: "center", marginTop: 6 }}>
        <select className="btn sm" aria-label="Kind of Test" value={test.kind} onChange={handleKind}>
          {TestKind.options.map((k) => (
            <option key={k} value={k}>
              {TEST_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {pool !== "trait" && (
          <select
            className="btn sm"
            aria-label="Skill or Attribute"
            value={test.skill ?? test.attribute ?? ""}
            onChange={handlePool}
          >
            {pool !== "attribute" &&
              SKILL_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s} ({SKILLS[s]})
                </option>
              ))}
            {pool !== "skill" &&
              ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {ATTRIBUTE_NAMES[a]}
                </option>
              ))}
          </select>
        )}
        {pool !== "either" && (
          <select className="btn sm" aria-label="DN" value={test.dn ?? 3} onChange={handleDn}>
            {dns.map((dn) => (
              <option key={dn} value={dn}>
                {dnLabel({ kind: test.kind, dn })}
              </option>
            ))}
          </select>
        )}
        {pool !== "either" && !corruption && (
          <NumberInput value={test.dn} label="DN, typed" max={20} onChange={handleDnTyped} />
        )}
        {test.kind === "resolve" && (
          <label>
            <input type="checkbox" checked={fear} onChange={(e) => setFear(e.target.checked)} /> FEAR
          </label>
        )}
        {pool !== "either" && (
          <label>
            <input type="checkbox" checked={hideDn} onChange={(e) => setHideDn(e.target.checked)} /> HIDE DN
          </label>
        )}
      </div>
      <div className="keys" role="group" aria-label="Agents who roll" style={{ marginTop: 6 }}>
        {agents.length > 1 && (
          <button className="btn sm" disabled={who.length === agents.length} onClick={handleAll}>
            ALL
          </button>
        )}
        {agents.map((c) => (
          <button
            key={c.id}
            className={`btn sm ${picked.has(c.id) ? "primary" : ""}`}
            aria-pressed={picked.has(c.id)}
            onClick={() => handleWho(c.id)}
          >
            {c.name.toUpperCase()}
          </button>
        ))}
        <button className="btn sm primary" disabled={!who.length} onClick={handleCall}>
          CALL {testTitle(test)}
        </button>
      </div>
    </details>
  );
}
