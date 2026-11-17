"use client";
import { useMemo, useState, type FormEvent } from "react";

import {
  Side,
  THREAT_CLASS_LABEL,
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
  type Lookups,
  pcHit,
  pcStatus,
  roundEndReminders,
  sideOf,
  sideUpNext,
  threatStatus,
  turnMark,
  type ActionInput,
  type Character,
  type Combatant,
  type LiveState,
  type MutationTable,
  type Threat,
  Visibility,
} from "@wg/shared";

import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { TurnActions } from "@/components/ui/turn-actions/turn-actions";
import { VISIBILITY_LABEL } from "@/components/ui/visibility-select/constants";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";
import { parseCommand } from "@/lib/command/command";
import { COUNTER_ACTIONS, type CounterField } from "@/lib/command/constants";
import { counterKey } from "@/lib/fight-delta/fight-delta";
import { combatantPortrait } from "@/lib/portraits/portraits";

import { AddCombatants } from "./components/add-combatants/add-combatants";
import { AttackGuide } from "./components/attack-guide/attack-guide";
import { CritPerils } from "./components/crit-perils/crit-perils";
import { DeltaPad } from "./components/delta-pad/delta-pad";
import { FightRow } from "./components/fight-row/fight-row";
import { KeyBar } from "./components/key-bar/key-bar";
import { RoundNotes } from "./components/round-notes/round-notes";
import { LOG_LIMIT, NEW_ROUND } from "./constants";
import type { KeyAction, LogEntry, Run, TurnDo, Vitals } from "./types";

type TrackerProps = {
  state: LiveState;
  send: Send;
  bestiary: Threat[];
  lookups?: Lookups | null;
  mutations?: MutationTable[];
};

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

export function Tracker({ state, send, bestiary, lookups = null, mutations = [] }: TrackerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // The delta pad: which row's number was tapped, and which track it is.
  const [pad, setPad] = useState<{ id: string; field: CounterField } | null>(null);
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

  if (!enc) return null; // SCENE mounts the tracker only while a fight is live, and starts one itself

  const current = enc.combatants.find((c) => c.id === enc.currentId) ?? null;
  const next = sideUpNext(state);
  const sel = enc.combatants.find((c) => c.id === selected) ?? null;
  const selChar = sel?.kind === "pc" ? chars.get(sel.characterId) : undefined;
  const selDerived = selChar ? derivedOf(selChar) : null;
  const rows = (side: Side) => enc.combatants.filter((c) => sideOf(c) === side);
  // Portrait slots only when some combatant has one, so a campaign without portraits keeps its narrow rows.
  const portraitOf = (c: Combatant) =>
    combatantPortrait({ combatant: c, character: c.kind === "pc" ? chars.get(c.characterId) : undefined });
  const portraits = enc.combatants.some((c) => portraitOf(c));
  const done = (side: Side) => `${rows(side).filter((c) => c.acted).length}/${rows(side).length}`;
  // Seize and AWARE are paid from the combatant's own side's pool: Glory for Agents, Ruin for Threats (p.177).
  const costOf = (c: Combatant) => (sideOf(c) === "agents" ? "1 GLORY" : "1 RUIN");
  const setup = enc.round === 0; // Steps 1–2, before Round 1 (§11.167)
  const nobodyCanAct = !enc.combatants.some((x) => canAct(state, x));
  // Nobody left and nobody acting: the Round waits for the GM, it never rolls over by itself (§11.169).
  const roundComplete = !setup && !current && nobodyCanAct;
  const vitalsOf = (c: Combatant): Vitals => {
    const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
    const d = ch ? derivedOf(ch) : null;
    return c.kind === "pc"
      ? {
          wounds: ch?.wounds ?? 0,
          maxWounds: d?.maxWounds ?? 0,
          shock: ch?.shock ?? 0,
          maxShock: d?.maxShock ?? 0,
          defence: d?.defence,
          resilience: d?.resilience,
        }
      : {
          wounds: c.wounds,
          maxWounds: c.maxWounds,
          shock: c.shock,
          maxShock: c.maxShock,
          defence: c.stats?.defence,
          resilience: c.stats?.resilience.value,
        };
  };

  // Row tap: select the combatant, or deselect it if already selected. The pad belongs to a row, so it closes.
  const toggleSelected = (id: string) => {
    setSelected(id === selected ? null : id);
    setPad(null);
  };

  // A row's WOUNDS or SHOCK number: selects that row and opens the pad on that track (a second tap on the same number
  // closes it).
  const handleCounter = ({ id, field }: { id: string; field: CounterField }) => {
    setSelected(id);
    setPad(pad?.id === id && pad.field === field ? null : { id, field });
  };

  // Delta pad: one signed delta on the padded row, through counterAction + run so the vox log, its notes and UNDO apply.
  const applyDelta = async ({
    combatant,
    field,
    delta,
  }: {
    combatant: Combatant;
    field: CounterField;
    delta: number;
  }) => {
    const { word } = COUNTER_ACTIONS[counterKey({ field, delta })];
    await run(
      counterAction({ combatant, field, delta }),
      `${nameOf(combatant).toUpperCase()} ${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${word}`,
    );
    setPad(null);
  };

  // What the pad shows of each track, as the row does: what's left. A Mob's Wounds are its members; no Shock track is null.
  const padReadout = (c: Combatant): Record<CounterField, string | null> => {
    const v = vitalsOf(c);
    return {
      wounds:
        c.kind === "threat" && c.mobCount !== null
          ? `×${c.mobCount} OF ${c.mobStart} MEMBERS`
          : `${Math.max(0, v.maxWounds - v.wounds)}/${v.maxWounds} LEFT`,
      shock: v.maxShock === null ? null : `${Math.max(0, v.maxShock - v.shock)}/${v.maxShock} LEFT`,
    };
  };

  // START / SEIZE / JUST GO: starts the combatant's turn (the api ends the current one first, §11.168), then lists Conditions
  // that tick at turn end for the one that was cut off and at turn start for this one, and the timed ones the api will
  // end with this Turn (§11.8).
  const startTurn = async (c: Combatant, mode: Extract<TurnDo, "start" | "justGo" | "seize">) => {
    const name = nameOf(c).toUpperCase();
    const prev = current && current.id !== c.id ? current : null;
    const r = await run(
      mode === "seize"
        ? { type: "turn.seize", id: c.id }
        : mode === "justGo"
          ? { type: "turn.start", id: c.id, force: true }
          : { type: "turn.start", id: c.id },
      mode === "seize"
        ? `SEIZE · ${name} ACTING`
        : mode === "justGo"
          ? `JUST GO · ${name} ACTING (out of order)`
          : `${name} ACTING`,
    );
    if (!r.ok) return r;
    if (prev) remind(prev, TURN_END_REMINDERS);
    remind(c, TURN_START_REMINDERS);
    for (const k of conditionsOf(c).filter(isTimed))
      push({ text: `${name}: ${k} ends at the end of this Turn`, warn: true });
    return r;
  };

  // END TURN / HOLD ACTION: ends the current turn (p.177: a held action stays for an INTERRUPT), then lists Conditions
  // that tick at turn end. The Round-end reminders wait in ROUND N COMPLETE.
  const endTurn = async (hold = false) => {
    const name = current ? nameOf(current).toUpperCase() : "TURN";
    const r = await run({ type: hold ? "turn.hold" : "turn.end" }, `${name} ${hold ? "HOLDS ACTION" : "END TURN"}`);
    if (r.ok && current) remind(current, TURN_END_REMINDERS);
    return r;
  };

  // BEGIN ROUND I: ambushes are set (Step 1), the fight opens (p.176).
  const begin = () => run({ type: "encounter.begin" }, "ROUND I BEGINS");

  // BEGIN ROUND N+1, or NEW ROUND from MORE to end the Round early (then its reminders go to the log, as no panel showed them).
  const newRound = async () => {
    const early = !roundComplete;
    const lines = roundEndReminders(enc, nameOf);
    const r = await run({ type: "encounter.newRound" }, roundComplete ? `ROUND ${enc.round + 1} BEGINS` : "NEW ROUND");
    if (r.ok && early) for (const text of lines) push({ text: text.toUpperCase(), warn: true });
    return r;
  };

  // TURN BACK (§11.170): the api undoes the last turn step and the damage since; it replaces undo for turn flow.
  const turnBack = () => run({ type: "turn.back" }, `TURN BACK: ${enc.back}`);

  // A row's turn dialog: each button is one turn action on that row.
  const doTurn = (c: Combatant, d: TurnDo) => {
    const name = nameOf(c).toUpperCase();
    switch (d) {
      case "start":
        return startTurn(c, "start");
      case "justGo":
        return startTurn(c, "justGo");
      case "seize":
        return startTurn(c, "seize");
      case "end":
        return endTurn();
      case "hold":
        return endTurn(true);
      case "markDone":
        return run({ type: "turn.mark", id: c.id, acted: true }, `${name} MARKED DONE`);
      case "notYet":
        return run({ type: "turn.mark", id: c.id, acted: false }, `${name} NOT YET`);
      case "interrupt":
        return run({ type: "turn.interrupt", id: c.id }, `${name} INTERRUPTS`);
      case "aware":
        return run({ type: "combatant.aware", id: c.id }, `${name} AWARE (${costOf(c)})`);
      case "ambush":
        return run({ type: "combatant.update", id: c.id, ambushed: true }, `${name} AMBUSHED`);
    }
  };

  // Step 1: one row's ACTS | AMBUSHED toggle, or a whole side's ALL AMBUSHED.
  const toggleAmbush = (c: Combatant) =>
    run(
      { type: "combatant.update", id: c.id, ambushed: !c.ambushed },
      `${nameOf(c).toUpperCase()} ${c.ambushed ? "ACTS" : "AMBUSHED"}`,
    );
  const toggleSideAmbush = (side: Side, ambushed: boolean) =>
    run(
      { type: "encounter.ambush", side, ambushed },
      `ALL ${side.toUpperCase()} ${ambushed ? "AMBUSHED" : "ACT IN ROUND I"}`,
    );

  // Typed turn commands go through the button handlers, so the same Condition reminders fire.
  const runCommand = (a: ActionInput) => {
    if (a.type === "turn.end") return endTurn();
    if (a.type === "turn.hold") return endTurn(true);
    if (a.type === "encounter.begin") return begin();
    if (a.type === "encounter.newRound") return newRound();
    if (a.type === "turn.back") return turnBack();
    const c = (a.type === "turn.start" || a.type === "turn.seize") && enc.combatants.find((x) => x.id === a.id);
    if (c) return startTurn(c, a.type === "turn.seize" ? "seize" : a.force ? "justGo" : "start");
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

  // Condition chip: toggles the Condition on the selected combatant.
  const handleConditionToggle = (k: string) => {
    if (!sel) return;
    const cur = conditionsOf(sel);
    const on = !cur.includes(k);
    void run(
      conditionsAction(sel, on ? [...cur, k] : cur.filter((x) => x !== k)),
      `${nameOf(sel).toUpperCase()} ${on ? "+" : "−"}${k.toUpperCase()}`,
    );
  };

  // What the phones show of a threat, set from MORE or toggled HIDDEN ↔ BARS by its row's chip. Hidden until its mini goes on the table
  // (§11.56).
  const setVisibility = ({ threat, visibility }: { threat: Combatant; visibility: Visibility }) => {
    void run(
      { type: "combatant.update", id: threat.id, visibility },
      `${nameOf(threat).toUpperCase()} ${VISIBILITY_LABEL[visibility]}`,
    );
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

  // The key bar: one turn button whose label follows the Round (BEGIN ROUND I, END <NAME>'S TURN, BEGIN ROUND N+1);
  // starting a Turn, SEIZE, JUST GO and the rest live on each row's turn mark.
  const primary: KeyAction | null = setup
    ? { label: "BEGIN ROUND I", onClick: begin }
    : current
      ? { label: `END ${nameOf(current).toUpperCase()}'S TURN`, onClick: () => endTurn() }
      : roundComplete
        ? { label: `BEGIN ROUND ${enc.round + 1}`, onClick: newRound }
        : null;
  const hold: KeyAction | null = current ? { label: "HOLD ACTION", onClick: () => endTurn(true) } : null;
  const act = (side: Side) => rows(side).filter((c) => !c.ambushed);
  const ambushedCount = enc.combatants.filter((c) => c.ambushed).length;
  const endReminders = roundComplete ? roundEndReminders(enc, nameOf) : [];

  return (
    <div className="tracker">
      <section className="tracker-main">
        <div className="turn-strip">
          {setup ? (
            <span className="accent display">STEP 1 · WHO IS AMBUSHED?</span>
          ) : current ? (
            <span className="now-chip">▶ {nameOf(current).toUpperCase()} ACTING</span>
          ) : roundComplete ? (
            <span className="accent display">ROUND {enc.round} COMPLETE · waits for you</span>
          ) : (
            <span className="accent display">{next ? `AWAITING: ${next.toUpperCase()} PICK` : "ROUND COMPLETE"}</span>
          )}
          {current && next && <i className="dim">Next: the {next} pick</i>}
          {enc.seizedSide && <span className="dim">{enc.seizedSide.toUpperCase()} SEIZED</span>}
          <span style={{ flex: 1 }} />
          {enc.back && (
            <button type="button" className="btn turn-back" aria-label={`Turn back: ${enc.back}`} onClick={turnBack}>
              <b>TURN BACK</b>
              <span className="dim">{enc.back}</span>
            </button>
          )}
          <span className="label">
            RND {enc.round} · AGENTS {done("agents")} · THREATS {done("threats")}
          </span>
        </div>
        {setup && (
          <RoundNotes
            head={`ROUND I · ${act("agents").length} AGENTS AND ${act("threats").length} THREATS ACT · ${ambushedCount} AMBUSHED`}
            items={[
              "Step 1 · Determine ambushes: an ambushed combatant has no Turn in Round 1; paying 1 Glory or 1 Ruin makes it aware (pp.176–177).",
              "Step 2 · Set the scene: narrate what each side sees, then begin the Round (p.176).",
            ]}
          />
        )}
        {endReminders.length > 0 && <RoundNotes head={`BEFORE ROUND ${enc.round + 1}`} items={endReminders} />}

        {Side.options.map((side) => (
          <div key={side} className="list table">
            <div className={`tbar ${side === "threats" ? "iron" : ""}`}>
              <span>{side.toUpperCase()}</span>
              {setup ? (
                <button
                  type="button"
                  className="tbar-toggle"
                  aria-pressed={rows(side).length > 0 && rows(side).every((c) => c.ambushed)}
                  onClick={() => toggleSideAmbush(side, !rows(side).every((c) => c.ambushed))}
                >
                  ALL AMBUSHED
                </button>
              ) : (
                <span style={{ fontSize: 12 }}>{done(side)} ACTED</span>
              )}
            </div>
            <div className={`fight-head fight-${side}`}>
              <span>STATE</span>
              <span>DESIGNATION</span>
              <span>WOUNDS</span>
              <span>SHOCK</span>
              <span className="hide-sm">DEF</span>
              <span className="hide-sm">RES</span>
              <span>STATUS</span>
              {side === "threats" && <span>PLAYERS SEE</span>}
            </div>
            <div className={`fight-rows fight-${side}`}>
              {rows(side).map((c) => {
                const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
                const d = ch ? derivedOf(ch) : null;
                const now = c.id === enc.currentId;
                const status = c.kind === "pc" ? (ch && d ? pcStatus(ch, d) : []) : threatStatus(c);
                const mark = turnMark(state, c);
                // READY on the side that isn't up: the order is a suggestion, so it offers SEIZE or JUST GO (§11.168).
                const offSide = mark === "ready" && next !== null && sideOf(c) !== next;
                const padId = `fight-pad-${c.id}`;
                return (
                  <FightRow
                    key={c.id}
                    combatant={c}
                    name={nameOf(c)}
                    vitals={vitalsOf(c)}
                    conditions={conditionsOf(c)}
                    status={status}
                    mark={mark}
                    setup={setup}
                    onAmbush={() => toggleAmbush(c)}
                    turn={{
                      nextSide: offSide ? next : null,
                      seizeCost: canSeize(state, sideOf(c)) ? costOf(c) : null,
                      awareCost: costOf(c),
                      canAmbush: enc.round === 1,
                      onDo: (d) => doTurn(c, d),
                    }}
                    portrait={portraits ? portraitOf(c) : undefined}
                    showPortrait={portraits}
                    now={now}
                    selected={c.id === selected}
                    padField={pad?.id === c.id ? pad.field : null}
                    padId={padId}
                    onSelect={() => toggleSelected(c.id)}
                    onCounter={(field) => handleCounter({ id: c.id, field })}
                    onVisibility={(visibility) => setVisibility({ threat: c, visibility })}
                  >
                    {pad?.id === c.id && (
                      <DeltaPad
                        id={padId}
                        name={nameOf(c)}
                        field={pad.field}
                        onField={(field) => setPad({ id: c.id, field })}
                        readout={padReadout(c)}
                        onApply={({ field, delta }) => applyDelta({ combatant: c, field, delta })}
                        onClose={() => setPad(null)}
                      />
                    )}
                  </FightRow>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ flex: 1 }} />
        {current && <TurnActions />}
        {error && <div className="red">! {error}</div>}
        <KeyBar
          key={sel?.id ?? "none"}
          primary={primary}
          hold={hold}
          conditions={sel && { name: nameOf(sel), active: conditionsOf(sel), onToggle: handleConditionToggle }}
          more={{
            remove: sel && { label: "REMOVE", onClick: handleRemove },
            newRound: setup || roundComplete ? null : { label: NEW_ROUND, onClick: newRound },
            endFight: { label: "END FIGHT", onClick: () => run({ type: "encounter.end" }, "ENCOUNTER ENDED") },
          }}
        >
          <AddCombatants state={state} run={run} bestiary={bestiary} />
        </KeyBar>
        <form className="cmd" onSubmit={handleCmdSubmit}>
          <span className="label" aria-hidden="true">
            ORDER ›
          </span>
          <input
            aria-label="Command"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="hollan dmg 3 · +2 · +pinned iskra · go daro · hold · back · begin · next"
          />
        </form>
      </section>

      <aside className="tracker-side">
        <AttackGuide
          state={state}
          attacker={current}
          target={sel && current && sideOf(sel) !== sideOf(current) ? sel : null}
          run={run}
        />
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
                <span className="dim">
                  <WeaponLine weapon={w} strength={effectiveStrength(selChar.stats)} />
                </span>
              </div>
            ))}
          </div>
        )}
        <CritPerils
          lookups={lookups}
          run={run}
          send={send}
          mutations={mutations}
          character={selChar}
          glory={state.campaign.glory}
          target={
            sel &&
            (sel.kind === "pc"
              ? { kind: "pc", id: sel.characterId, conditions: conditionsOf(sel), name: nameOf(sel) }
              : {
                  kind: "threat",
                  id: sel.id,
                  conditions: conditionsOf(sel),
                  threatClass: sel.threatClass,
                  maxShock: sel.maxShock,
                  name: nameOf(sel),
                })
          }
        />
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
