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
  isExhausted,
  isTimed,
  type Lookups,
  pcHit,
  pcStatus,
  roundEndReminders,
  sideOf,
  sideUpNext,
  sustainHitReminder,
  sustainedPowers,
  sustainTurnReminder,
  threatStatus,
  turnMark,
  type ActionInput,
  type Character,
  type Codex,
  type Combatant,
  type JournalItem,
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
import { FIGHTS_AS_LABEL, runByOptions } from "@/lib/ally/ally";
import { chronicleTurns } from "@/lib/chronicle/chronicle";
import { parseCommand } from "@/lib/command/command";
import { COUNTER_ACTIONS, type CounterField } from "@/lib/command/constants";
import { counterKey } from "@/lib/fight-delta/fight-delta";
import { combatantPortrait } from "@/lib/portraits/portraits";

import { AddCombatants } from "./components/add-combatants/add-combatants";
import { AttackGuide } from "./components/attack-guide/attack-guide";
import { CritPerils, type PerilsRequest } from "./components/crit-perils/crit-perils";
import { DeltaPad } from "./components/delta-pad/delta-pad";
import { FightRow } from "./components/fight-row/fight-row";
import { JournalHistory } from "./components/journal-history/journal-history";
import { KeyBar } from "./components/key-bar/key-bar";
import { PsychicPanel } from "./components/psychic-panel/psychic-panel";
import { RoundNotes } from "./components/round-notes/round-notes";
import { RunBy } from "./components/run-by/run-by";
import { LOG_LIMIT, NEW_ROUND } from "./constants";
import type { KeyAction, LogEntry, Run, TurnDo, Vitals } from "./types";

type TrackerProps = {
  state: LiveState;
  codex: Codex; // an ally's NPC: its category and the Agent it follows (issue #350)
  // HISTORY's entries, pushed by the api (the `journal` socket event).
  journal: JournalItem[];
  send: Send;
  bestiary: Threat[];
  lookups?: Lookups | null;
  mutations?: MutationTable[];
};

// What a tap did beyond its delta, read against the state at tap time with the same rules the api runs, because some
// taps don't do what their delta says: Shock while Exhausted is Mortal Wounds (p.199), a Wound on a Dying PC is a
// Traumatic Injury (p.193), one huge hit Annihilates (p.194). The chronicle line says so.
function noteOf({ action: a, state }: { action: ActionInput; state: LiveState }): string {
  const converted = (exhausted: boolean, shock = 0) => (exhausted && shock > 0 ? " → MORTAL WOUNDS (p.199)" : "");
  if (a.type === "character.adjust" && !a.raw) {
    const ch = state.characters.find((c) => c.id === a.id);
    if (!ch) return "";
    const d = deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier });
    const hit = pcHit({ c: ch, d, hit: a });
    if (hit.annihilated && !ch.annihilated) return " → ANNIHILATED (p.194)";
    return hit.traumatic > ch.traumatic
      ? " → TRAUMATIC INJURY (p.193)"
      : converted(isExhausted({ ...ch, maxShock: d.maxShock }), a.shock);
  }
  if (a.type === "combatant.adjust" && !a.raw) {
    const c = state.encounter?.combatants.find((x) => x.id === a.id);
    return c?.kind === "threat" && c.mobCount === null ? converted(isExhausted(c), a.shock) : "";
  }
  return "";
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

export function Tracker({ state, codex, journal, send, bestiary, lookups = null, mutations = [] }: TrackerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // The delta pad: which row's number was tapped, and which track it is.
  const [pad, setPad] = useState<{ id: string; field: CounterField } | null>(null);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [perilsRequest, setPerilsRequest] = useState<PerilsRequest>();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false); // MORE's HISTORY dialog
  const enc = state.encounter;
  const tier = state.campaign.tier;
  const chars = useMemo(() => new Map(state.characters.map((c) => [c.id, c])), [state.characters]);
  const npcs = useMemo(() => new Map(codex.npcs.map((n) => [n.id, n])), [codex.npcs]);

  const nameOf = (c: Combatant) => (c.kind === "pc" ? (chars.get(c.characterId)?.name ?? "?") : c.label);

  // Whose chronicle entry a line joins: the Turn being played, or the Round between Turns. A Turn's first line (START,
  // SEIZE) and a Round's (BEGIN ROUND N) open their own entry, since the state here is still the one before them.
  const whoNow = () => {
    const c = enc?.combatants.find((x) => x.id === enc.currentId);
    return c ? nameOf(c).toUpperCase() : enc?.round ? `ROUND ${enc.round}` : "BEFORE ROUND 1";
  };
  const whoFor = (a: ActionInput) => {
    const starts = (a.type === "turn.start" || a.type === "turn.seize") && enc?.combatants.find((x) => x.id === a.id);
    if (starts) return nameOf(starts).toUpperCase();
    if (a.type === "encounter.begin" || a.type === "encounter.newRound") return `ROUND ${(enc?.round ?? 0) + 1}`;
    return whoNow();
  };

  const push = ({ who = whoNow(), ...e }: Omit<LogEntry, "id" | "who"> & { who?: string }) =>
    setLog((l) => [{ ...e, who, id: Date.now() + Math.random() }, ...l].slice(0, LOG_LIMIT));

  // Sends an action; on success writes its chronicle line with the journal entry it became (what UNDO HIT and HISTORY
  // revert), on refusal shows the server's reason.
  const run: Run = async (a, text) => {
    const r = await send(a);
    if (!r.ok) {
      setError(r.error);
      return r;
    }
    setError(null);
    const hit = (a.type === "character.adjust" || a.type === "combatant.adjust") && !!(a.wounds || a.shock);
    push({ text: text + noteOf({ action: a, state }), who: whoFor(a), entry: r.entry, hit });
    // Lines only the server knows, e.g. Enduring Life's 1d6 Corruption per Traumatic Wound (p.294).
    const agent = a.type === "character.adjust" ? `${chars.get(a.id)?.name.toUpperCase() ?? "?"}: ` : "";
    for (const n of r.notices ?? []) push({ text: agent + n, who: whoFor(a), warn: true });
    return r;
  };

  const conditionsOf = (c: Combatant) =>
    c.kind === "pc" ? (chars.get(c.characterId)?.conditions ?? []) : c.conditions;
  const derivedOf = (ch: Character) => deriveStats({ stats: ch.stats, overrides: ch.overrides, tier });

  // Turn boundaries: remind the GM of Conditions that tick (pp.198-200).
  const remind = (c: Combatant, table: Record<string, string>) => {
    for (const k of conditionsOf(c)) {
      const text = table[k];
      if (text) push({ text: `${nameOf(c).toUpperCase()}: ${text}`, who: nameOf(c).toUpperCase(), warn: true });
    }
  };

  if (!enc) return null; // SCENE mounts the tracker only while a fight is live, and starts one itself

  const current = enc.combatants.find((c) => c.id === enc.currentId) ?? null;
  const next = sideUpNext(state);
  const sel = enc.combatants.find((c) => c.id === selected) ?? null;
  const selChar = sel?.kind === "pc" ? chars.get(sel.characterId) : undefined;
  const selDerived = selChar ? derivedOf(selChar) : null;
  // A PC with Psychic Mastery or a power on its sheet, a threat with the PSYKER keyword (Core p.257).
  const selPsyker =
    sel?.kind === "pc"
      ? (selChar?.stats.skills["Psychic Mastery"] ?? 0) > 0 || !!selChar?.stats.powers?.length
      : !!sel?.stats?.keywords.includes("PSYKER");
  const rows = (side: Side) => enc.combatants.filter((c) => sideOf(c) === side);
  // Portrait slots only when some combatant has one, so a campaign without portraits keeps its narrow rows.
  const portraitOf = (c: Combatant) =>
    combatantPortrait({ combatant: c, character: c.kind === "pc" ? chars.get(c.characterId) : undefined });
  const portraits = enc.combatants.some((c) => portraitOf(c));
  const tally = (list: Combatant[]) => `${list.filter((c) => c.acted).length}/${list.length}`;
  const done = (side: Side) => tally(rows(side));
  // Allies fight on the Agents' side, as a sub-block under them (issue #350, §11.208).
  const isAlly = (c: Combatant) => c.kind === "threat" && c.ally;
  const allies = rows("agents").filter(isAlly);
  const agentsOnly = rows("agents").filter((c) => !isAlly(c));
  const agentOptions = enc.combatants.flatMap((c) =>
    c.kind === "pc" ? [{ id: c.characterId, name: chars.get(c.characterId)?.name ?? "?" }] : [],
  );
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

  // Delta pad: one signed delta on the padded row, through counterAction + run so the chronicle, its notes and UNDO HIT apply.
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
    const r = await run(
      counterAction({ combatant, field, delta }),
      `${nameOf(combatant).toUpperCase()} ${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${word}`,
    );
    // Damage to a psyker sustaining powers: remind of the Willpower Test (the entered amount, not what stuck). Perils
    // damage goes through the lookup's APPLY instead, so it never reminds (§11.182).
    if (r.ok && delta > 0) {
      const text = sustainHitReminder({
        name: nameOf(combatant).toUpperCase(),
        conditions: conditionsOf(combatant),
        wounds: field === "wounds" ? delta : 0,
        shock: field === "shock" ? delta : 0,
      });
      if (text) push({ text, warn: true });
    }
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
    const sustain = sustainTurnReminder({ name: nameOf(c).toUpperCase(), conditions: conditionsOf(c) });
    if (sustain) push({ text: sustain, who: name, warn: true });
    for (const k of conditionsOf(c).filter(isTimed))
      push({ text: `${name}: ${k} ends at the end of this Turn`, who: name, warn: true });
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

  // PsychicPanel SUSTAIN: writes the selected combatant's Conditions list back with a log line.
  const handleSustainChange = ({ conditions, text }: { conditions: string[]; text: string }) => {
    if (sel) void run(conditionsAction(sel, conditions), text);
  };

  // PsychicPanel MANIFEST: one activation per Round; any Wrath 1 opens PERILS with the extra 1s (Core p.262, §11.181).
  const handleManifest = async ({ power, ones }: { power: string; ones: number }) => {
    if (!sel) return false;
    const r = await run(
      { type: "combatant.manifest", id: sel.id, power },
      `${nameOf(sel).toUpperCase()} MANIFESTS ${power.toUpperCase()}`,
    );
    if (r.ok && ones >= 1) {
      push({ text: "PERILS OF THE WARP (Core p.263)", warn: true });
      setPerilsRequest({ table: "perils", extraOnes: ones - 1, key: (perilsRequest?.key ?? 0) + 1 });
    }
    return r.ok;
  };

  // What the phones show of a threat, set from MORE or toggled HIDDEN ↔ BARS by its row's chip. Hidden until its mini goes on the table
  // (§11.56).
  const setVisibility = ({ threat, visibility }: { threat: Combatant; visibility: Visibility }) => {
    void run(
      { type: "combatant.update", id: threat.id, visibility },
      `${nameOf(threat).toUpperCase()} ${VISIBILITY_LABEL[visibility]}`,
    );
  };

  // RUN BY: the GM hands an ally to an Agent's player, or takes it back (the server refuses an Ally given to a player).
  const setRunBy = ({ ally, controllerId }: { ally: Combatant; controllerId: string | null }) => {
    const who = controllerId ? (chars.get(controllerId)?.name ?? "?") : "THE GM";
    void run(
      { type: "combatant.update", id: ally.id, controllerId },
      `${nameOf(ally).toUpperCase()} RUN BY ${who.toUpperCase()}`,
    );
  };

  // The RUN BY picker for one ally row: THE GM, and the Agents in the fight unless its NPC is an Ally.
  const runByFor = (c: Combatant, as: "chip" | "button") => {
    if (c.kind !== "threat" || !c.ally) return null;
    const npc = c.npcId ? npcs.get(c.npcId) : undefined;
    return (
      <RunBy
        name={nameOf(c)}
        current={c.controllerId}
        options={runByOptions({ agents: agentOptions, fightsAs: npc?.fightsAs ?? null })}
        onPick={(controllerId) => setRunBy({ ally: c, controllerId })}
        as={as}
      />
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

  // The chronicle: the log by Turn, and which of its lines the server's journal says were undone since (UNDO HIT here,
  // HISTORY's UNDO, or a REDO that brought one back).
  const turns = chronicleTurns(log);
  const undone = new Set(journal.filter((j) => j.undoneBy).map((j) => j.id));
  const isUndone = (l: LogEntry) => !!l.entry && undone.has(l.entry);
  const lastHit = log.find((l) => l.hit && l.entry && !isUndone(l));

  // UNDO HIT: the server reverts the last Wounds or Shock tap still standing (journal.undo). A refusal ("Undo … first.")
  // shows on the error line; the journal the api pushes next strikes the line through.
  const undoHit = async () => {
    if (!lastHit?.entry) return;
    const r = await send({ type: "journal.undo", entryId: lastHit.entry });
    setError(r.ok ? null : r.error);
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

  // One combatant's row, an ally's with its category chip and RUN BY in place of PLAYERS SEE.
  const renderRow = (c: Combatant) => {
    const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
    const d = ch ? derivedOf(ch) : null;
    const now = c.id === enc.currentId;
    const status = c.kind === "pc" ? (ch && d ? pcStatus(ch, d) : []) : threatStatus(c);
    const mark = turnMark(state, c);
    // READY on the side that isn't up: the order is a suggestion, so it offers SEIZE or JUST GO (§11.168).
    const offSide = mark === "ready" && next !== null && sideOf(c) !== next;
    const padId = `fight-pad-${c.id}`;
    const npc = c.kind === "threat" && c.npcId ? npcs.get(c.npcId) : undefined;
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
        allyTag={isAlly(c) ? FIGHTS_AS_LABEL[npc?.fightsAs === "follower" ? "follower" : "ally"] : undefined}
        runBy={runByFor(c, "chip")}
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
  };

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
            RND {enc.round} · AGENTS {tally(agentsOnly)}
            {allies.length > 0 && ` · ALLIES ${tally(allies)}`} · THREATS {done("threats")}
          </span>
        </div>
        {setup && (
          <RoundNotes
            head={`ROUND I · ${act("agents").length} ${allies.length ? "AGENTS AND ALLIES" : "AGENTS"} AND ${act("threats").length} THREATS ACT · ${ambushedCount} AMBUSHED`}
            items={[
              "Step 1 · Determine ambushes: an ambushed combatant has no Turn in Round 1; paying 1 Glory or 1 Ruin makes it aware (pp.176–177).",
              "Step 2 · Set the scene: narrate what each side sees, then begin the Round (p.176).",
            ]}
          />
        )}
        {endReminders.length > 0 && <RoundNotes head={`BEFORE ROUND ${enc.round + 1}`} items={endReminders} />}

        {Side.options.map((side) => {
          const list = side === "agents" ? agentsOnly : rows(side);
          const withAllies = side === "agents" && allies.length > 0;
          return (
            <div key={side} className="list table">
              <div className={`tbar ${side === "threats" ? "iron" : ""}`}>
                <span>{withAllies ? "AGENTS & ALLIES" : side.toUpperCase()}</span>
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
              <div className={`fight-head fight-${side}${withAllies ? " with-run" : ""}`}>
                <span>STATE</span>
                <span>DESIGNATION</span>
                <span>WOUNDS</span>
                <span>SHOCK</span>
                <span className="hide-sm">DEF</span>
                <span className="hide-sm">RES</span>
                <span>STATUS</span>
                {side === "threats" && <span>PLAYERS SEE</span>}
                {withAllies && <span>RUN BY</span>}
              </div>
              <div className={`fight-rows fight-${side}${withAllies ? " with-run" : ""}`}>{list.map(renderRow)}</div>
              {withAllies && (
                <>
                  <div className="fight-allies-h">
                    <span>ALLIES · ON THE AGENTS&apos; SIDE</span>
                    <span>NOT IN THE BUDGET</span>
                  </div>
                  <div className="fight-rows fight-agents with-run fight-allies">{allies.map(renderRow)}</div>
                </>
              )}
            </div>
          );
        })}

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
            history: { label: "HISTORY", onClick: () => setHistory(true) },
            endFight: { label: "END FIGHT", onClick: () => run({ type: "encounter.end" }, "ENCOUNTER ENDED") },
          }}
        >
          <AddCombatants state={state} codex={codex} run={run} bestiary={bestiary} />
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
          <button
            type="button"
            className="btn"
            disabled={!lastHit}
            aria-label={lastHit ? `Undo the last hit: ${lastHit.text}` : "Undo the last hit: none to undo"}
            onClick={undoHit}
          >
            UNDO HIT
          </button>
        </form>
      </section>

      <aside className="tracker-side">
        <AttackGuide
          state={state}
          attacker={current}
          target={sel && current && sideOf(sel) !== sideOf(current) ? sel : null}
          run={run}
        />
        {sel?.kind === "threat" && sel.ally && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="rule">ALLY · {sel.label.toUpperCase()}</div>
            <div className="dim">
              {sel.npcId && npcs.get(sel.npcId)?.followsId
                ? `Follows ${chars.get(npcs.get(sel.npcId)?.followsId ?? "")?.name ?? "an Agent"} · `
                : ""}
              On the Agents&apos; side: the players pick it, Seize and AWARE cost 1 Glory, off the budget (§11.208).
            </div>
            {runByFor(sel, "button")}
          </div>
        )}
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
        {/* A psyker, or anyone still sustaining: keyed by combatant, so a typed power, its Wrath 1s and the SUSTAIN offer
            belong to one psyker. */}
        {sel && (selPsyker || sustainedPowers(conditionsOf(sel)).length > 0) && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="rule">PSYCHIC POWERS</div>
            <PsychicPanel
              key={sel.id}
              name={nameOf(sel)}
              manifested={sel.manifested}
              conditions={conditionsOf(sel)}
              known={selChar?.stats.powers ?? []}
              onChange={handleSustainChange}
              onManifest={handleManifest}
            />
          </div>
        )}
        <CritPerils
          lookups={lookups}
          run={run}
          send={send}
          mutations={mutations}
          character={selChar}
          glory={state.campaign.glory}
          request={perilsRequest}
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
        <section className="chronicle" aria-label="Chronicle of the fight">
          <div className="rule">CHRONICLE · {setup ? "BEFORE ROUND 1" : `ROUND ${enc.round}`}</div>
          {turns.length === 0 && <div className="dim">Nothing chronicled yet.</div>}
          <div className="chronicle-log">
            {turns.map((t, i) => (
              <div key={t.lines[0]?.id} className={`chronicle-turn${i === 0 ? " top" : ""}`}>
                <span className="chronicle-who">
                  {i === 0 && current && t.who === nameOf(current).toUpperCase() ? "NOW · " : ""}
                  {t.who}
                </span>
                {t.lines.map((l) => (
                  <span
                    key={l.id}
                    className={`chronicle-line${l.warn ? " accent" : ""}${isUndone(l) ? " undone" : ""}`}
                  >
                    {isUndone(l) && "UNDONE · "}
                    {l.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {enc.back && (
            <p className="chronicle-hint">
              TURN BACK takes back the last turn step, its marks and the damage dealt since. A Seize or AWARE gets its
              Glory or Ruin back. Tap it again to go further back.
            </p>
          )}
        </section>
        {history && <JournalHistory items={journal} send={send} onClose={() => setHistory(false)} />}
      </aside>
    </div>
  );
}
