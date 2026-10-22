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
import { CritPerils } from "./components/crit-perils/crit-perils";
import { DeltaPad } from "./components/delta-pad/delta-pad";
import { FightRow } from "./components/fight-row/fight-row";
import { KeyBar } from "./components/key-bar/key-bar";
import { LOG_LIMIT, NEW_ROUND, VISIBILITY_TAP } from "./constants";
import type { KeyAction, LogEntry, Run, Vitals } from "./types";

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

  if (!enc)
    return (
      <div className="pad stack">
        <div className="rule">NO ACTIVE ENCOUNTER</div>
        <p className="dim">Start one here, or run a scene with a prepared encounter from PREP.</p>
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
  // Portrait slots only when some combatant has one, so a campaign without portraits keeps its narrow rows.
  const portraitOf = (c: Combatant) =>
    combatantPortrait({ combatant: c, character: c.kind === "pc" ? chars.get(c.characterId) : undefined });
  const portraits = enc.combatants.some((c) => portraitOf(c));
  const done = (side: Side) => `${rows(side).filter((c) => c.acted).length}/${rows(side).length}`;
  const seizeCost = sel && sideOf(sel) === "agents" ? "1 GLORY" : "1 RUIN";
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
  const toggleVisibility = (c: Combatant) => {
    if (c.kind !== "threat") return;
    setVisibility({ threat: c, visibility: VISIBILITY_TAP[c.visibility] });
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

  // The key bar: one turn button whose label follows the turn state, SEIZE when it's open to the selected row (§3.1).
  const nobodyCanAct = !enc.combatants.some((x) => canAct(state, x));
  const primary: KeyAction | null = current
    ? { label: "END TURN", onClick: endTurn }
    : sel && canAct(state, sel)
      ? { label: `START ${nameOf(sel).toUpperCase()}'S TURN`, onClick: () => startTurn(sel, false) }
      : nobodyCanAct
        ? { label: NEW_ROUND, onClick: newRound }
        : null;
  const seize: KeyAction | null =
    sel && !current && canAct(state, sel) && canSeize(state, sideOf(sel))
      ? { label: `SEIZE · ${seizeCost}`, onClick: () => startTurn(sel, true) }
      : null;
  const ambush: KeyAction | null =
    sel && enc.round === 1 && !sel.acted
      ? sel.ambushed
        ? { label: `AWARE · ${seizeCost}`, onClick: handleAware }
        : { label: "AMBUSH", onClick: handleAmbush }
      : null;

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
                const stateLabel = now
                  ? "▶ ACTING"
                  : c.acted
                    ? "DONE"
                    : c.ambushed && enc.round === 1
                      ? "AMBUSHED"
                      : "READY";
                const padId = `fight-pad-${c.id}`;
                return (
                  <FightRow
                    key={c.id}
                    combatant={c}
                    name={nameOf(c)}
                    vitals={vitalsOf(c)}
                    conditions={conditionsOf(c)}
                    status={status}
                    stateLabel={stateLabel}
                    portrait={portraits ? portraitOf(c) : undefined}
                    showPortrait={portraits}
                    now={now}
                    selected={c.id === selected}
                    padField={pad?.id === c.id ? pad.field : null}
                    padId={padId}
                    onSelect={() => toggleSelected(c.id)}
                    onCounter={(field) => handleCounter({ id: c.id, field })}
                    onVisibility={() => toggleVisibility(c)}
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
          seize={seize}
          conditions={sel && { name: nameOf(sel), active: conditionsOf(sel), onToggle: handleConditionToggle }}
          more={{
            ambush,
            visibility:
              sel?.kind === "threat"
                ? { value: sel.visibility, onPick: (visibility) => setVisibility({ threat: sel, visibility }) }
                : null,
            remove: sel && { label: "REMOVE", onClick: handleRemove },
            newRound: primary?.label === NEW_ROUND ? null : { label: NEW_ROUND, onClick: newRound },
            endFight: { label: "END FIGHT", onClick: () => run({ type: "encounter.end" }, "ENCOUNTER ENDED") },
          }}
        />
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
