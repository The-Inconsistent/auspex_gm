"use client";
import type { ChangeEvent } from "react";

import {
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  CORRUPTION_DNS,
  DN_TABLE,
  MAX_SHIFTS,
  MAX_TESTS,
  SKILLS,
  TEST_POOL,
  TestKind,
  TestWho,
  retypeTest,
  type BeatTest,
  type Skill,
} from "@wg/shared";

import { RuleIdLink } from "@/components/ui/rule-link/rule-link";

import { TEST_KIND_LABELS } from "../../../../constants";
import { dnLabel, testTitle } from "../../../../utils";
import { ATTITUDE_SHIFT, FAIL_FORWARD, NEW_TEST, SHIFT_USES, skillPenalty } from "./constants";

type TestsProps = { tests: BeatTest[]; onChange: (tests: BeatTest[]) => void };

const SKILL_NAMES = Object.keys(SKILLS) as Skill[];
const signed = (n: number) => (n === 0 ? "NONE" : n > 0 ? `+${n}` : `−${-n}`);

// What the scene asks the Agents to roll (issue #39): per Test, its kind and pool, the DN, who rolls, what it's for,
// the Shifts the GM has ready and both outcomes. The app never rolls a Test.
export function Tests({ tests, onChange }: TestsProps) {
  const setTest = (i: number, patch: Partial<BeatTest>) =>
    onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  // ↑ / ↓: swaps Test i with its neighbour.
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tests.length) return;
    const next = [...tests];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  // Kind: keeps the Skill or Attribute and the DN where the new kind still takes them.
  const handleKindChange = (i: number, e: ChangeEvent<HTMLSelectElement>) =>
    onChange(tests.map((t, j) => (j === i ? retypeTest(t, TestKind.parse(e.target.value)) : t)));

  // Pool: "skill:Awareness" or "attribute:S"; an Opposed Test takes either.
  const handlePoolChange = (i: number, e: ChangeEvent<HTMLSelectElement>) => {
    const [of, name] = e.target.value.split(":");
    const skill = SKILL_NAMES.find((s) => s === name) ?? null;
    const attribute = ATTRIBUTES.find((a) => a === name) ?? null;
    setTest(i, of === "skill" ? { skill, attribute: null } : { skill: null, attribute });
  };

  // DN field: digits only, kept inside the schema's 1 to 20.
  const handleDnChange = (i: number, e: ChangeEvent<HTMLInputElement>) =>
    setTest(i, { dn: Math.min(20, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) });

  const setShift = ({ i, j, text }: { i: number; j: number; text: string }) =>
    setTest(i, { shifts: tests[i]!.shifts.map((s, k) => (k === j ? text : s)) });

  // A Fail Forward chip adds its consequence to what failure brings.
  const addFailure = (i: number, text: string) =>
    setTest(i, { onFailure: [tests[i]!.onFailure.trim(), text].filter(Boolean).join("; ") });

  return (
    <div className="field">
      <span className="label">TESTS · {tests.length}</span>
      {tests.map((t, i) => {
        const pool = TEST_POOL[t.kind];
        const dns = t.kind === "corruption" ? DN_TABLE.filter((r) => CORRUPTION_DNS.some((d) => d === r.dn)) : DN_TABLE;
        const id = `test-${i}`;
        return (
          <div key={i} className="item stack" style={{ gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b>TEST {i + 1}</b>
              <span className="dim" style={{ flex: 1 }}>
                {testTitle(t)} · {dnLabel(t.dn)}
                {t.who === "each" ? " · EACH AGENT" : ""}
              </span>
              <button className="btn sm" aria-label={`Move test ${i + 1} up`} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="btn sm" aria-label={`Move test ${i + 1} down`} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button
                className="btn sm danger"
                aria-label={`Remove test ${i + 1}`}
                onClick={() => onChange(tests.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>

            <div className="keys" style={{ alignItems: "flex-end" }}>
              <div className="field">
                <label className="label" htmlFor={`${id}-kind`}>
                  KIND
                </label>
                <select id={`${id}-kind`} className="input" value={t.kind} onChange={(e) => handleKindChange(i, e)}>
                  {TestKind.options.map((k) => (
                    <option key={k} value={k}>
                      {TEST_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              {pool !== "trait" && (
                <div className="field">
                  <label className="label" htmlFor={`${id}-pool`}>
                    {pool === "attribute" ? "ATTRIBUTE" : pool === "skill" ? "SKILL" : "SKILL OR ATTRIBUTE"}
                  </label>
                  <select
                    id={`${id}-pool`}
                    className="input"
                    value={t.skill ? `skill:${t.skill}` : `attribute:${t.attribute}`}
                    onChange={(e) => handlePoolChange(i, e)}
                  >
                    {pool !== "attribute" && (
                      <optgroup label="Skills">
                        {SKILL_NAMES.map((s) => (
                          <option key={s} value={`skill:${s}`}>
                            {s} ({SKILLS[s]})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {pool !== "skill" && (
                      <optgroup label="Attributes">
                        {ATTRIBUTES.map((a) => (
                          <option key={a} value={`attribute:${a}`}>
                            {ATTRIBUTE_NAMES[a]} ({a})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
              <div className="field">
                <span className="label">WHO ROLLS</span>
                <div style={{ display: "flex", gap: 6 }} role="group" aria-label={`Who rolls test ${i + 1}`}>
                  {TestWho.options.map((w) => (
                    <button
                      key={w}
                      className={`btn sm ${t.who === w ? "primary" : ""}`}
                      aria-pressed={t.who === w}
                      onClick={() => setTest(i, { who: w })}
                    >
                      {w.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label className="label" htmlFor={`${id}-purpose`}>
                  PURPOSE · WHAT THEY ARE TRYING TO DO
                </label>
                <input
                  id={`${id}-purpose`}
                  className="input"
                  maxLength={300}
                  value={t.purpose}
                  onChange={(e) => setTest(i, { purpose: e.target.value })}
                />
              </div>
            </div>

            {pool === "either" ? (
              <div className="dim" style={{ fontSize: 12 }}>
                <span className="chip">NO DN</span> Each side rolls its own pool. The most Icons wins, and a tie goes to
                the side that started it (Core Rulebook p.170).
              </div>
            ) : (
              <div className="field">
                <span className="label">
                  DN · HOW HARD IT LOOKS TO THE AGENT ·{" "}
                  <RuleIdLink id="test-dn">
                    <span className="chip">DN TABLE</span>
                  </RuleIdLink>
                </span>
                <div className="keys" role="group" aria-label={`DN of test ${i + 1}`}>
                  {dns.map((r) => (
                    <button
                      key={r.dn}
                      className={`btn sm ${t.dn === r.dn ? "primary" : ""}`}
                      aria-pressed={t.dn === r.dn}
                      onClick={() => setTest(i, { dn: r.dn })}
                    >
                      {r.dn} {r.name.toUpperCase()} <small>{signed(r.modifier)}</small>
                    </button>
                  ))}
                  <input
                    className="input"
                    style={{ width: 70 }}
                    aria-label={`DN of test ${i + 1}`}
                    inputMode="numeric"
                    value={t.dn ?? ""}
                    onChange={(e) => handleDnChange(i, e)}
                  />
                </div>
                {t.dn !== null && t.dn < 3 && (
                  <div className="dim" style={{ fontSize: 12 }}>
                    Under most circumstances, don’t roll for a DN lower than 3 (Core Rulebook p.122).
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <span className="label">
                SHIFT LADDER · {t.shifts.length} OF {MAX_SHIFTS} ·{" "}
                <RuleIdLink id="test-shifting">
                  <span className="chip">SHIFTING</span>
                </RuleIdLink>
              </span>
              {t.shifts.map((s, j) => (
                <div key={j} className="keys" style={{ alignItems: "center" }}>
                  <span className="dim">{j + 1}</span>
                  <input
                    className="input"
                    style={{ flex: 1, width: "auto" }}
                    aria-label={`Test ${i + 1}, Shift ${j + 1}`}
                    maxLength={200}
                    value={s}
                    onChange={(e) => setShift({ i, j, text: e.target.value })}
                  />
                  <button
                    className="btn sm danger"
                    aria-label={`Remove Shift ${j + 1} of test ${i + 1}`}
                    onClick={() => setTest(i, { shifts: t.shifts.filter((_, k) => k !== j) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="keys">
                {["", ...SHIFT_USES, ...(t.skill ? [ATTITUDE_SHIFT] : [])].map((use) => (
                  <button
                    key={use}
                    className="btn sm"
                    disabled={t.shifts.length >= MAX_SHIFTS}
                    onClick={() => setTest(i, { shifts: [...t.shifts, use] })}
                  >
                    + {use ? use.toUpperCase() : "SHIFT"}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${id}-success`}>
                ON SUCCESS
              </label>
              <textarea
                id={`${id}-success`}
                className="input"
                maxLength={500}
                value={t.onSuccess}
                onChange={(e) => setTest(i, { onSuccess: e.target.value })}
              />
            </div>
            <div className="field">
              <span>
                <label className="label" htmlFor={`${id}-failure`}>
                  ON FAILURE · FAIL FORWARD
                </label>{" "}
                <RuleIdLink id="test-fail-forward">
                  <span className="chip">FAIL FORWARD</span>
                </RuleIdLink>
              </span>
              <textarea
                id={`${id}-failure`}
                className="input"
                maxLength={500}
                value={t.onFailure}
                onChange={(e) => setTest(i, { onFailure: e.target.value })}
              />
              <div className="keys">
                {[...(t.skill ? [skillPenalty(t.skill)] : []), ...FAIL_FORWARD].map((f) => (
                  <button key={f} className="btn sm" onClick={() => addFailure(i, f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn sm" disabled={tests.length >= MAX_TESTS} onClick={() => onChange([...tests, NEW_TEST])}>
          + TEST
        </button>
        <span className="dim" style={{ fontSize: 12 }}>
          {tests.length} of {MAX_TESTS}. The dice stay on the table: this is what you have ready.
        </span>
      </div>
    </div>
  );
}
