"use client";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import {
  CONDITIONS,
  Side,
  THREAT_CLASS_RULES,
  TURN_END_REMINDERS,
  TURN_START_REMINDERS,
  canAct,
  canSeize,
  deriveStats,
  effectiveStrength,
  exhaustedShock,
  isExhausted,
  isTimed,
  pcHit,
  pcStatus,
  roundEndReminders,
  sideOf,
  sideUpNext,
  threatStatus,
  type ActionInput,
  type Character,
  type Combatant,
  type LiveState,
  type Threat,
} from "@wg/shared";

import { Bar } from "@/components/ui/bar/bar";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import type { Send } from "@/hooks/use-table/use-table";
import { parseCommand } from "@/lib/command/command";
import { COUNTER_ACTIONS, COUNTER_ACTION_KEYS, type CounterAction, type CounterField } from "@/lib/command/constants";
import { weaponLine } from "@/lib/weapon-line/weapon-line";

import { AddCombatants } from "./components/add-combatants/add-combatants";
import { AMOUNTS, LOG_LIMIT, THREAT_CLASS_LABEL } from "./constants";
import type { LogEntry, Run } from "./types";

type TrackerProps = { state: LiveState; send: Send; bestiary: Threat[] };

// What a tap will do, read against the state at tap time with the same rules the api runs, because some taps don't do
// what their delta says: Shock while Exhausted is Mortal Wounds (p.199), a Wound on a Dying PC is a Traumatic Injury
// (p.193), one huge hit Annihilates (p.194), Shock on a Mob removes one member or nothing (p.325). Undo sends the exact
// difference back as a raw adjust (no rules), and `note` tells the GM what happened.
// ponytail: undo doesn't take back an automatic Prone, and a tap that raced another client's diffs the older state;
// server-side history if that bites.
function preview({ action: a, state }: { action: ActionInput; state: LiveState }): {
  undo?: ActionInput;
  note: string;
} {
  const back = (before: number, after: number) => before - after || undefined;
  const converted = (exhausted: boolean, shock = 0) => (exhausted && shock > 0 ? " → MORTAL WOUNDS (p.199)" : "");
  const neg = (n?: number) => (n === undefined ? undefined : -n);
  // An undo's own undo (redo): raw deltas go back as they came. ponytail: inexact if one was clamped at 0.
  if (a.type === "character.adjust" && a.raw)
    return {
      undo: { ...a, wounds: neg(a.wounds), shock: neg(a.shock), wrath: neg(a.wrath), traumatic: neg(a.traumatic) },
      note: "",
    };
  if (a.type === "combatant.adjust" && a.raw)
    return { undo: { ...a, wounds: neg(a.wounds), shock: neg(a.shock), personalRuin: neg(a.personalRuin) }, note: "" };
  if (a.type === "character.adjust") {
    const ch = state.characters.find((c) => c.id === a.id);
    if (!ch) return { note: "" };
    const d = deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier });
    const hit = pcHit({ c: ch, d, hit: a });
    if (hit.annihilated && !ch.annihilated)
      return { undo: { type: "character.update", id: a.id, annihilated: false }, note: " → ANNIHILATED (p.194)" };
    return {
      undo: {
        type: "character.adjust",
        id: a.id,
        raw: true,
        wounds: back(ch.wounds, hit.wounds),
        shock: back(ch.shock, hit.shock),
        traumatic: back(ch.traumatic, Math.max(0, hit.traumatic + (a.traumatic ?? 0))),
        wrath: back(ch.wrath, Math.max(0, ch.wrath + (a.wrath ?? 0))),
      },
      note:
        hit.traumatic > ch.traumatic
          ? " → TRAUMATIC INJURY (p.193)"
          : converted(isExhausted({ ...ch, maxShock: d.maxShock }), a.shock),
    };
  }
  if (a.type === "combatant.adjust") {
    const c = state.encounter?.combatants.find((x) => x.id === a.id);
    if (c?.kind !== "threat") return { note: "" };
    const personalRuin = back(c.personalRuin, Math.max(0, c.personalRuin + (a.personalRuin ?? 0)));
    if (c.mobCount !== null) {
      const loss = (a.wounds ?? 0) + (a.shock !== undefined && c.maxShock !== null && a.shock > c.maxShock ? 1 : 0);
      const after = Math.min(c.mobStart ?? c.mobCount, Math.max(0, c.mobCount - loss));
      return {
        undo: { type: "combatant.adjust", id: a.id, raw: true, wounds: back(after, c.mobCount), personalRuin },
        note: "",
      };
    }
    const exhausted = isExhausted(c);
    const hit = exhaustedShock({ exhausted, wounds: a.wounds, shock: a.shock });
    return {
      undo: {
        type: "combatant.adjust",
        id: a.id,
        raw: true,
        personalRuin,
        wounds: back(c.wounds, Math.max(0, c.wounds + hit.wounds)),
        shock: back(c.shock, Math.max(0, c.shock + hit.shock)),
      },
      note: converted(exhausted, a.shock),
    };
  }
  if (a.type === "pool.adjust") return { undo: { ...a, delta: -a.delta }, note: "" };
  return { note: "" };
}

// PCs' counters live on their character; threats' on the combatant row.
const counterAction = ({
  combatant: c,
  field,
  delta,
}: {
  combatant: Combatant;
  field: CounterField;
  delta: number;
}): ActionInput =>
  c.kind === "pc"
    ? { type: "character.adjust", id: c.characterId, [field]: delta }
    : { type: "combatant.adjust", id: c.id, [field]: delta };

// Same split for Conditions.
const conditionsAction = (c: Combatant, conditions: string[]): ActionInput =>
  c.kind === "pc"
    ? { type: "character.update", id: c.characterId, conditions }
    : { type: "combatant.update", id: c.id, conditions };

export function Tracker({ state, send, bestiary }: TrackerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [amountFor, setAmountFor] = useState<CounterAction | null>(null);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const enc = state.encounter;
  const tier = state.campaign.tier;
  const chars = useMemo(() => new Map(state.characters.map((c) => [c.id, c])), [state.characters]);

  const push = (e: Omit<LogEntry, "id">) =>
    setLog((l) => [{ ...e, id: Date.now() + Math.random() }, ...l].slice(0, LOG_LIMIT));

  // Sends an action; on success logs it with its undo, on refusal shows the server's reason.
  const run: Run = async (a, text) => {
    const r = await send(a);
    if (!r.ok) {
      setError(r.error);
      return r;
    }
    setError(null);
    const { undo, note } = preview({ action: a, state });
    push({ text: text + note, undo });
    return r;
  };

  const nameOf = (c: Combatant) => (c.kind === "pc" ? (chars.get(c.characterId)?.name ?? "?") : c.label);
  const conditionsOf = (c: Combatant) =>
    c.kind === "pc" ? (chars.get(c.characterId)?.conditions ?? []) : c.conditions;
  const derivedOf = (ch: Character) => deriveStats({ stats: ch.stats, overrides: ch.overrides, tier });

  // Turn boundaries: remind the GM of Conditions that tick (pp.198-200).
  const remind = (c: Combatant, table: Record<string, string>) => {
    for (const k of conditionsOf(c)) {
      const text = table[k];
      if (text) push({ text: `${nameOf(c).toUpperCase()}: ${text}`, warn: true });
    }
  };

  if (!enc)
    return (
      <div className="pad stack">
        <div className="rule">NO ACTIVE ENCOUNTER</div>
        <p className="dim">Start one here, or run a beat with a prepared encounter from PREP.</p>
        <div>
          <button className="btn primary" onClick={() => run({ type: "encounter.start" }, "ENCOUNTER STARTED")}>
            START ENCOUNTER
          </button>
        </div>
      </div>
    );

  const current = enc.combatants.find((c) => c.id === enc.currentId) ?? null;
  const next = sideUpNext(state);
  const sel = enc.combatants.find((c) => c.id === selected) ?? null;
  const selChar = sel?.kind === "pc" ? chars.get(sel.characterId) : undefined;
  const selDerived = selChar ? derivedOf(selChar) : null;
  const rows = (side: Side) => enc.combatants.filter((c) => sideOf(c) === side);
  const done = (side: Side) => `${rows(side).filter((c) => c.acted).length}/${rows(side).length}`;
  const seizeCost = sel && sideOf(sel) === "agents" ? "1 GLORY" : "1 RUIN";

  // Row tap: select the combatant, or deselect it if already selected.
  const toggleSelected = (id: string) => setSelected(id === selected ? null : id);

  // Amount pad: applies the chosen counter action × n to the selected combatant.
  const applyAmount = async (n: number) => {
    if (!sel || !amountFor) return;
    const { field, sign, word } = COUNTER_ACTIONS[amountFor];
    await run(
      counterAction({ combatant: sel, field, delta: sign * n }),
      `${nameOf(sel).toUpperCase()} ${sign > 0 ? "+" : "−"}${n} ${word}`,
    );
    setAmountFor(null);
  };

  // START TURN / SEIZE: starts the combatant's turn, then lists Conditions that tick at turn start, and the timed ones
  // the api will end with this Turn (§11.8).
  const startTurn = async (c: Combatant, seize: boolean) => {
    const r = await run(
      { type: seize ? "turn.seize" : "turn.start", id: c.id },
      `${seize ? "SEIZE · " : ""}${nameOf(c).toUpperCase()} ACTING`,
    );
    if (!r.ok) return r;
    remind(c, TURN_START_REMINDERS);
    for (const k of conditionsOf(c).filter(isTimed))
      push({ text: `${nameOf(c).toUpperCase()}: ${k} ends at the end of this Turn`, warn: true });
    return r;
  };

  // Round end: Mobs with half or more slain test Resolve (p.325).
  const remindRoundEnd = () => {
    for (const text of roundEndReminders(enc)) push({ text: text.toUpperCase(), warn: true });
  };

  // END TURN: ends the current turn, then lists Conditions that tick at turn end, and the Round-end Tests if this was the
  // last Turn of the Round (the api rolls the Round over on the same rule, canAct).
  const endTurn = async () => {
    const roundEnds = !enc.combatants.some((x) => canAct(state, x));
    const r = await run({ type: "turn.end" }, `${current ? nameOf(current).toUpperCase() : "TURN"} END TURN`);
    if (r.ok && current) remind(current, TURN_END_REMINDERS);
    if (r.ok && roundEnds) remindRoundEnd();
    return r;
  };

  // NEW ROUND: the GM ends the Round early.
  const newRound = async () => {
    const r = await run({ type: "encounter.newRound" }, "NEW ROUND");
    if (r.ok) remindRoundEnd();
  };

  // Typed turn commands go through the button handlers, so the same Condition reminders fire.
  const runCommand = (a: ActionInput) => {
    if (a.type === "turn.end") return endTurn();
    const c = (a.type === "turn.start" || a.type === "turn.seize") && enc.combatants.find((x) => x.id === a.id);
    if (c) return startTurn(c, a.type === "turn.seize");
    return run(a, `> ${cmd.toUpperCase()}`);
  };

  // Command line: parses the typed command and runs each resulting action in order. A refusal keeps the text for editing.
  const handleCmdSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = parseCommand({ input: cmd, state, selected });
    if ("error" in p) return setError(p.error);
    for (const a of p.actions) {
      const r = await runCommand(a);
      if (!r.ok) return;
    }
    setCmd("");
  };

  // Condition picker: toggles the chosen Condition on the selected combatant.
  const handleConditionPick = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!sel) return;
    const k = e.target.value;
    const cur = conditionsOf(sel);
    const on = !cur.includes(k);
    void run(
      conditionsAction(sel, on ? [...cur, k] : cur.filter((x) => x !== k)),
      `${nameOf(sel).toUpperCase()} ${on ? "+" : "−"}${k.toUpperCase()}`,
    );
  };

  // REVEAL / HIDE: whether players see the selected threat's full stat block.
  const handleRevealToggle = () => {
    if (sel?.kind !== "threat") return;
    void run(
      { type: "combatant.update", id: sel.id, revealed: !sel.revealed },
      `${nameOf(sel).toUpperCase()} ${sel.revealed ? "HIDDEN" : "REVEALED"}`,
    );
  };

  // AWARE: pays to let an ambushed combatant act in Round 1.
  const handleAware = () => {
    if (!sel) return;
    void run({ type: "combatant.aware", id: sel.id }, `${nameOf(sel).toUpperCase()} AWARE (${seizeCost})`);
  };

  // AMBUSH: the selected combatant skips Round 1.
  const handleAmbush = () => {
    if (!sel) return;
    void run({ type: "combatant.update", id: sel.id, ambushed: true }, `${nameOf(sel).toUpperCase()} AMBUSHED`);
  };

  // REMOVE: takes the selected combatant out of the fight and clears the selection.
  const handleRemove = async () => {
    if (!sel) return;
    await run({ type: "combatant.remove", id: sel.id }, `${nameOf(sel).toUpperCase()} REMOVED`);
    setSelected(null);
  };

  // Personal Ruin: spend (−1) or gain (+1) on the selected Adversary.
  const adjustPersonalRuin = (delta: number) => {
    if (sel?.kind !== "threat") return;
    void run(
      { type: "combatant.adjust", id: sel.id, personalRuin: delta },
      `${sel.label.toUpperCase()} ${delta < 0 ? "SPENT PERSONAL RUIN" : "+PERSONAL RUIN"}`,
    );
  };

  // +TRAUMATIC: one more Traumatic Injury on the selected Agent.
  const handleTraumatic = () => {
    if (!selChar) return;
    void run(
      { type: "character.adjust", id: selChar.id, traumatic: 1 },
      `${selChar.name.toUpperCase()} +TRAUMATIC INJURY`,
    );
  };

  // RESTORE: takes back an Annihilation (a mistyped hit).
  const handleRestore = () => {
    if (!selChar) return;
    void run(
      { type: "character.update", id: selChar.id, annihilated: false },
      `${selChar.name.toUpperCase()} RESTORED`,
    );
  };

  // UNDO: sends the inverse delta, then drops the entry from the log once it went through.
  const handleUndo = async (entry: LogEntry) => {
    if (!entry.undo) return;
    const r = await run(entry.undo, `UNDO: ${entry.text}`);
    if (r.ok) setLog((x) => x.filter((y) => y.id !== entry.id)); // a refused undo keeps its button
  };

  return (
    <div className="tracker">
      <section className="tracker-main">
        <div className="turn-strip">
          {current ? (
            <span className="now-chip">▶ {nameOf(current).toUpperCase()} ACTING</span>
          ) : (
            <span className="accent display">{next ? `AWAITING: ${next.toUpperCase()} PICK` : "ROUND COMPLETE"}</span>
          )}
          {current && next && <i className="dim">Next: the {next} pick</i>}
          {enc.seizedSide && <span className="dim">{enc.seizedSide.toUpperCase()} SEIZED</span>}
          <span style={{ flex: 1 }} />
          <span className="label">
            RND {enc.round} · AGENTS {done("agents")} · THREATS {done("threats")}
          </span>
        </div>

        {Side.options.map((side) => (
          <div key={side} className="list table">
            <div className={`tbar ${side === "threats" ? "iron" : ""}`}>
              <span>{side.toUpperCase()}</span>
              <span style={{ fontSize: 12 }}>{done(side)} ACTED</span>
            </div>
            <div className="row head">
              <span>STATE</span>
              <span>DESIGNATION</span>
              <span className="hide-sm">CLASS</span>
              <span>WOUNDS</span>
              <span className="hide-sm">SHOCK</span>
              <span className="hide-sm">DEF</span>
              <span className="hide-sm">RES</span>
              <span>STATUS</span>
              <span className="hide-sm">PLAYERS</span>
            </div>
            {rows(side).map((c) => {
              const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
              const d = ch ? derivedOf(ch) : null;
              const now = c.id === enc.currentId;
              const status = c.kind === "pc" ? (ch && d ? pcStatus(ch, d) : []) : threatStatus(c);
              const stateLabel = now
                ? "▶ ACTING"
                : c.acted
                  ? "DONE"
                  : c.ambushed && enc.round === 1
                    ? "AMBUSHED"
                    : "READY";
              return (
                <button
                  key={c.id}
                  className={`row ${now ? "now" : ""} ${c.id === selected ? "sel" : ""} ${c.acted ? "done" : ""}`}
                  aria-pressed={c.id === selected}
                  onClick={() => toggleSelected(c.id)}
                >
                  <span className={now ? "accent" : "dim"}>{stateLabel}</span>
                  <span style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
                    {c.kind === "threat" && c.marker && (
                      <span
                        role="img"
                        aria-label={`${c.marker} marker`}
                        style={{
                          width: 10,
                          height: 10,
                          background: `var(--marker-${c.marker})`,
                          border: "1.5px solid var(--ink)",
                          display: "inline-block",
                        }}
                      />
                    )}
                    {nameOf(c).toUpperCase()}
                  </span>
                  <span className="hide-sm">{c.kind === "pc" ? "AGENT" : THREAT_CLASS_LABEL[c.threatClass]}</span>
                  <span>
                    {c.kind === "threat" && c.mobCount !== null ? (
                      <span className="bar">
                        ×{c.mobCount}{" "}
                        <span style={{ fontSize: 14 }} className="dim">
                          OF {c.mobStart}
                        </span>
                      </span>
                    ) : (
                      <Bar
                        value={c.kind === "pc" ? (ch?.wounds ?? 0) : c.wounds}
                        max={c.kind === "pc" ? (d?.maxWounds ?? 0) : c.maxWounds}
                        danger
                      />
                    )}
                  </span>
                  <span className="hide-sm">
                    <Bar
                      value={c.kind === "pc" ? (ch?.shock ?? 0) : c.shock}
                      max={c.kind === "pc" ? (d?.maxShock ?? 0) : c.maxShock}
                    />
                  </span>
                  <span className="hide-sm">{c.kind === "pc" ? d?.defence : c.stats?.defence}</span>
                  <span className="hide-sm">{c.kind === "pc" ? d?.resilience : c.stats?.resilience.value}</span>
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <StatusChips items={status} />
                    {conditionsOf(c).map((k) => (
                      <span key={k} className="chip">
                        {k.toUpperCase()}
                      </span>
                    ))}
                  </span>
                  <span
                    className="hide-sm"
                    style={{ color: c.kind === "threat" && !c.revealed ? "var(--red)" : "var(--ink-3)" }}
                  >
                    {c.kind === "pc" ? "FULL" : c.revealed ? "FULL" : "BAR ONLY"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ flex: 1 }} />
        {error && <div className="red">! {error}</div>}
        {amountFor && sel ? (
          <div className="keys">
            <span className="accent" style={{ alignSelf: "center" }}>
              {amountFor.toUpperCase()} → {nameOf(sel).toUpperCase()}:
            </span>
            {AMOUNTS.map((n) => (
              <button key={n} className="btn sq" onClick={() => applyAmount(n)}>
                {n}
              </button>
            ))}
            <button className="btn" onClick={() => setAmountFor(null)}>
              CANCEL
            </button>
          </div>
        ) : (
          <div className="keys">
            {current && (
              <button className="btn primary" onClick={endTurn}>
                END TURN
              </button>
            )}
            {sel && !current && canAct(state, sel) && (
              <button className="btn primary" onClick={() => startTurn(sel, false)}>
                START TURN
              </button>
            )}
            {sel && !current && canAct(state, sel) && canSeize(state, sideOf(sel)) && (
              <button className="btn" onClick={() => startTurn(sel, true)}>
                SEIZE · {seizeCost}
              </button>
            )}
            {sel && (
              <>
                {COUNTER_ACTION_KEYS.map((k) => (
                  <button key={k} className="btn" onClick={() => setAmountFor(k)}>
                    {COUNTER_ACTIONS[k].button}
                  </button>
                ))}
                <select className="btn" aria-label="Toggle condition" value="" onChange={handleConditionPick}>
                  <option value="">±COND</option>
                  {CONDITIONS.map((k) => (
                    <option key={k} value={k}>
                      {conditionsOf(sel).includes(k) ? `− ${k}` : `+ ${k}`}
                    </option>
                  ))}
                </select>
                {sel.kind === "threat" && (
                  <button className="btn" onClick={handleRevealToggle}>
                    {sel.revealed ? "HIDE" : "REVEAL"}
                  </button>
                )}
                {enc.round === 1 &&
                  !sel.acted &&
                  (sel.ambushed ? (
                    <button className="btn" onClick={handleAware}>
                      AWARE · {seizeCost}
                    </button>
                  ) : (
                    <button className="btn" onClick={handleAmbush}>
                      AMBUSH
                    </button>
                  ))}
                <button className="btn danger" onClick={handleRemove}>
                  REMOVE
                </button>
              </>
            )}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={newRound}>
              NEW ROUND
            </button>
            <button className="btn danger" onClick={() => run({ type: "encounter.end" }, "ENCOUNTER ENDED")}>
              END ENC
            </button>
          </div>
        )}
        <form className="cmd" onSubmit={handleCmdSubmit}>
          <span className="label" aria-hidden="true">
            ORDER ›
          </span>
          <input
            aria-label="Command"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="hollan dmg 3 · +2 · +pinned iskra · seize daro · end"
          />
        </form>
        <AddCombatants state={state} run={run} bestiary={bestiary} />
      </section>

      <aside className="tracker-side">
        {sel?.kind === "threat" && sel.stats && (
          <>
            <div
              style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
              aria-label={`${THREAT_CLASS_LABEL[sel.threatClass]} rules (pp.323-324)`}
            >
              {THREAT_CLASS_RULES[sel.threatClass].map((k) => (
                <span key={k} className="chip">
                  {k.toUpperCase()}
                </span>
              ))}
            </div>
            <StatBlock t={sel.stats} tier={state.campaign.tier} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sel.stats.personalRuin !== undefined && (
                <>
                  <span className="chip">PERSONAL RUIN {sel.personalRuin}</span>
                  <button className="btn sm" onClick={() => adjustPersonalRuin(-1)}>
                    SPEND
                  </button>
                  <button className="btn sm" onClick={() => adjustPersonalRuin(1)}>
                    +1
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {selChar && selDerived && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="rule">{selChar.name.toUpperCase()}</div>
            <div className="dim">
              {selChar.stats.archetype} · {selChar.stats.keywords.join(", ")}
            </div>
            <div>
              DEF {selDerived.defence} · RES {selDerived.resilience} · DETERMINATION {selDerived.determination}d6 ·
              RESOLVE {selDerived.resolve}
            </div>
            <div>
              WRATH {selChar.wrath} · TRAUMATIC {selChar.traumatic}/{selDerived.maxTraumatic}{" "}
              <button className="btn sm" onClick={handleTraumatic}>
                +TRAUMATIC
              </button>
            </div>
            {selChar.annihilated && (
              <div className="red">
                ANNIHILATED (p.194){" "}
                <button className="btn sm" onClick={handleRestore}>
                  RESTORE
                </button>
              </div>
            )}
            {selChar.stats.weapons.map((w) => (
              <div key={w.name}>
                <b>{w.name}</b>{" "}
                <span className="dim">{weaponLine({ weapon: w, strength: effectiveStrength(selChar.stats) })}</span>
              </div>
            ))}
          </div>
        )}
        <div className="rule">VOX LOG</div>
        {log.length === 0 && <div className="dim">No transmissions.</div>}
        {log.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px dashed var(--line)",
              paddingBottom: 6,
            }}
          >
            <span style={{ flex: 1, fontSize: 15 }} className={l.warn ? "accent" : undefined}>
              {l.text}
            </span>
            {l.undo && (
              <button className="btn sm" onClick={() => handleUndo(l)}>
                UNDO
              </button>
            )}
          </div>
        ))}
      </aside>
    </div>
  );
}
