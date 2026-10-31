"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import {
  ATTRIBUTE_NAMES,
  ATTRIBUTES,
  CORRUPTION_DNS,
  DN_TABLE,
  MAX_SHIFTS,
  MAX_TESTS,
  SKILLS,
  SOCIAL_SKILLS,
  TEST_KIND_LABELS,
  TEST_POOL,
  TestKind,
  TEST_WHO_LABEL,
  TestWho,
  dnLabel,
  retypeTest,
  sourceCite,
  testTitle,
  type BeatTest,
  type Skill,
  type SkillDn,
} from "@wg/shared";

import { FindField, type FindOption } from "@/components/ui/find-field/find-field";
import { NumberInput } from "@/components/ui/number-input/number-input";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";

import { DragHandle, moveItem, useReorder } from "@/hooks/use-reorder/use-reorder";

import { ATTITUDE_SHIFT, FAIL_FORWARD, GLORY_SHIFT, NEW_TEST, SHIFT_USES, skillPenalty } from "./constants";

type TestsProps = { tests: BeatTest[]; skillDns: SkillDn[]; onChange: (tests: BeatTest[]) => void };

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
const SKILL_NAMES = Object.keys(SKILLS) as Skill[];
const SKILL_OPTIONS = SKILL_NAMES.map((s) => ({ id: `skill:${s}`, name: s, detail: `(${SKILLS[s]})` }));
const ATTRIBUTE_OPTIONS = ATTRIBUTES.map((a) => ({ id: `attribute:${a}`, name: ATTRIBUTE_NAMES[a], detail: `(${a})` }));
// What the second box finds for a new Test of each kind: a trait kind (Influence, Resolve, Corruption) needs none.
const ADD_OPTIONS: Record<"skill" | "attribute" | "either", { label: string; options: FindOption[] }> = {
  skill: { label: "Find a Skill", options: SKILL_OPTIONS },
  attribute: { label: "Find an Attribute", options: ATTRIBUTE_OPTIONS },
  either: { label: "Find a Skill or Attribute", options: [...SKILL_OPTIONS, ...ATTRIBUTE_OPTIONS] },
};

// What the scene asks the Agents to roll (issue #39): per Test, its kind and pool, the DN, who rolls, what it's for,
// the Shifts the GM has ready and both outcomes. The app never rolls a Test. Rows open one at a time (canvas
// Flow-EditorTests); BeatEditor draws the TESTS · n heading.
export function Tests({ tests, skillDns, onChange }: TestsProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [addKind, setAddKind] = useState<TestKind>("skill");
  const addPool = TEST_POOL[addKind];
  const reorder = useReorder({
    count: tests.length,
    // The open row stays open wherever it is dragged to.
    onMove: (from, to) => {
      onChange(moveItem(tests, from, to));
      setOpen((o) => (o === from ? to : o === to ? from : o));
    },
  });

  const setTest = (i: number, patch: Partial<BeatTest>) =>
    onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

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

  // The blank input after the last Shift is index shifts.length: typing in it appends, and emptying the last Shift
  // drops it, so the blank input never doubles. A blank in the middle waits for BeatEditor's save to drop it.
  const setShift = ({ i, j, text }: { i: number; j: number; text: string }) => {
    const shifts = [...tests[i]!.shifts];
    shifts[j] = text;
    while (shifts.length && !shifts[shifts.length - 1]!.trim()) shifts.pop();
    setTest(i, { shifts });
  };

  // A Fail Forward chip adds its consequence to what failure brings.
  const addFailure = (i: number, text: string) =>
    setTest(i, { onFailure: [tests[i]!.onFailure.trim(), text].filter(Boolean).join("; ") });

  // A new Test of the kind picked first, rolling the Skill or Attribute picked second ("skill:Awareness", "attribute:Wil").
  const addTest = (pick?: string) => {
    const [of, name] = pick?.split(":") ?? [];
    const skill = of === "skill" ? (SKILL_NAMES.find((s) => s === name) ?? null) : null;
    const attribute = of === "attribute" ? (ATTRIBUTES.find((a) => a === name) ?? null) : null;
    onChange([...tests, retypeTest({ ...NEW_TEST, skill, attribute }, addKind)]);
    setOpen(tests.length);
  };

  return (
    <div className="field">
      <div className="ed-rows">
        {tests.map((t, i) => {
          const pool = TEST_POOL[t.kind];
          const dns =
            t.kind === "corruption" ? DN_TABLE.filter((r) => CORRUPTION_DNS.some((d) => d === r.dn)) : DN_TABLE;
          const id = `test-${i}`;
          const isOpen = open === i;
          const row = DN_TABLE.find((r) => r.dn === t.dn);
          // The book's own example of this Skill at this DN (Core pp.122–126), when it prints one.
          const example = t.skill ? skillDns.find((d) => d.skill === t.skill && d.dn === t.dn) : undefined;
          return (
            <div key={i} ref={reorder.rowRef(i)} className={`ed-row${isOpen ? " open" : ""}`}>
              <div className="ed-row-head">
                <DragHandle label={`test ${i + 1}, ${testTitle(t)}`} {...reorder.handle(i)} />
                <button
                  type="button"
                  className="ed-sum"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {t.dn === null ? dnLabel(t) : `DN ${t.dn}`} · {testTitle(t)}
                    {t.purpose.trim() ? ` · ${t.purpose.trim()}` : ""}
                  </span>
                  <span className="dim">{TEST_WHO_LABEL[t.who]}</span>
                  {isOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                </button>
              </div>
              {isOpen && (
                <div className="ed-row-body">
                  <div className="keys" style={{ alignItems: "flex-end" }}>
                    <div className="field">
                      <label className="label" htmlFor={`${id}-kind`}>
                        KIND
                      </label>
                      <select
                        id={`${id}-kind`}
                        className="input"
                        value={t.kind}
                        onChange={(e) => handleKindChange(i, e)}
                      >
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
                      <div className="seg" role="group" aria-label={`Who rolls test ${i + 1}`}>
                        {TestWho.options.map((w) => (
                          <button
                            key={w}
                            className={`btn sm ${t.who === w ? "primary" : ""}`}
                            aria-pressed={t.who === w}
                            onClick={() => setTest(i, { who: w })}
                          >
                            {TEST_WHO_LABEL[w]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="field">
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

                  {pool === "either" ? (
                    <div className="dim" style={{ fontSize: 12 }}>
                      <span className="chip">NO DN</span> Each side rolls its own pool. The most Icons wins, and a tie
                      goes to the side that started it (Core Rulebook p.170). With no DN there is nothing to Shift
                      against (p.165).
                    </div>
                  ) : (
                    <div className="field">
                      <span className="label">
                        {t.dn === null
                          ? "DN · "
                          : row
                            ? `DN ${t.dn} · ${row.name.toUpperCase()}${row.modifier ? ` (${signed(row.modifier)})` : ""} · `
                            : `DN ${t.dn} · `}
                        <RuleIdLink id="test-dn">
                          <span className="chip">DN TABLE</span>
                        </RuleIdLink>
                      </span>
                      <div className="keys" style={{ alignItems: "center" }}>
                        <div className="seg" role="group" aria-label={`DN of test ${i + 1}`}>
                          {dns.map((r) => (
                            <button
                              key={r.dn}
                              className={`btn sm ${t.dn === r.dn ? "primary" : ""}`}
                              aria-label={`DN ${r.dn}, ${r.name}`}
                              aria-pressed={t.dn === r.dn}
                              onClick={() => setTest(i, { dn: r.dn })}
                            >
                              {r.dn}
                            </button>
                          ))}
                        </div>
                        <NumberInput
                          value={t.dn}
                          label={`DN of test ${i + 1}`}
                          max={20}
                          onChange={(dn) => setTest(i, { dn })}
                        />
                      </div>
                      {example && (
                        <div className="dim" style={{ fontSize: 12 }}>
                          <span className="label">
                            {example.skill}, DN {example.dn}
                          </span>{" "}
                          <i>{example.example}</i> ({sourceCite(example)})
                        </div>
                      )}
                      {t.dn === null && (
                        <div className="dim" style={{ fontSize: 12 }}>
                          No DN yet: you set it at the table (Core Rulebook p.160).
                        </div>
                      )}
                      {t.dn !== null && t.dn < 3 && (
                        <div className="dim" style={{ fontSize: 12 }}>
                          Under most circumstances, don’t roll for a DN lower than 3 (Core Rulebook p.122).
                        </div>
                      )}
                    </div>
                  )}

                  {pool !== "either" && (
                    <div className="field">
                      <span className="label">
                        SHIFT LADDER · {t.shifts.length} OF {MAX_SHIFTS} ·{" "}
                        <RuleIdLink id="test-shifting">
                          <span className="chip">SHIFTING</span>
                        </RuleIdLink>
                      </span>
                      {[...t.shifts, ...(t.shifts.length < MAX_SHIFTS ? [""] : [])].map((s, j) => (
                        <input
                          key={j}
                          className="input"
                          aria-label={
                            j < t.shifts.length ? `Test ${i + 1}, Shift ${j + 1}` : `Test ${i + 1}, another Shift`
                          }
                          placeholder={j < t.shifts.length ? undefined : "+ Another Shift…"}
                          maxLength={200}
                          value={s}
                          onChange={(e) => setShift({ i, j, text: e.target.value })}
                        />
                      ))}
                      <span className="dim" style={{ fontSize: 12 }}>
                        Clear a Shift to drop it when you save.
                      </span>
                      <div className="keys">
                        {[...SHIFT_USES, ...(t.skill && SOCIAL_SKILLS.includes(t.skill) ? [ATTITUDE_SHIFT] : [])].map(
                          (use) => (
                            <button
                              key={use}
                              className="btn sm"
                              disabled={
                                t.shifts.length >= MAX_SHIFTS || (use === GLORY_SHIFT && t.shifts.includes(GLORY_SHIFT))
                              }
                              onClick={() => setTest(i, { shifts: [...t.shifts, use] })}
                            >
                              + {use.toUpperCase()}…
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

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

                  <div>
                    <button
                      className="lnk red"
                      aria-label={`Remove test ${i + 1}`}
                      onClick={() => {
                        onChange(tests.filter((_, j) => j !== i));
                        setOpen(null);
                      }}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tests.length < MAX_TESTS ? (
        <div className="keys" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label className="label" htmlFor="test-new-kind">
              NEW TEST
            </label>
            <select
              id="test-new-kind"
              className="input"
              value={addKind}
              onChange={(e) => setAddKind(TestKind.parse(e.target.value))}
            >
              {TestKind.options.map((k) => (
                <option key={k} value={k}>
                  {TEST_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            {addPool === "trait" ? (
              <button type="button" className="btn" onClick={() => addTest()}>
                + ADD {TEST_KIND_LABELS[addKind]} TEST
              </button>
            ) : (
              <FindField key={addPool} {...ADD_OPTIONS[addPool]} onPick={addTest} />
            )}
          </div>
        </div>
      ) : (
        <span className="dim" style={{ fontSize: 12 }}>
          {tests.length} of {MAX_TESTS}
        </span>
      )}
      <span className="dim" style={{ fontSize: 12 }}>
        The dice stay on the table: this is what you have ready.
      </span>
    </div>
  );
}
