import { CONDITIONS, type ActionInput, type LiveState } from "@wg/shared";

import { COUNTER_ACTIONS, type CounterAction } from "./constants.ts";

// The Auspex command line: `hollan dmg 3`, `boyz +2`, `iskra shock 1`, `+pinned iskra`, `end`, `ruin +1`.
// Wounds count up in W&G, so `+3` = 3 Wounds taken and `-3` = heal 3. Without a target, the selected row is used.

type Target = { name: string; combatantId: string; characterId: string | null };
export type Parsed = { actions: ActionInput[] } | { error: string };

const VERBS: Record<string, string> = {
  dmg: "wounds",
  d: "wounds",
  wound: "wounds",
  w: "wounds",
  heal: "heal",
  h: "heal",
  shock: "shock",
  s: "shock",
  rec: "recover",
  recover: "recover",
  r: "recover",
  start: "start",
  go: "start",
  seize: "seize",
  aware: "aware",
  ambush: "ambush",
  reveal: "reveal",
  show: "show",
  hide: "hide",
  mob: "mob",
  wrath: "wrath",
  remove: "remove",
};

export function targetsOf(s: LiveState): Target[] {
  const names = new Map(s.characters.map((c) => [c.id, c.name]));
  return (s.encounter?.combatants ?? []).map((c) =>
    c.kind === "pc"
      ? { name: names.get(c.characterId) ?? "?", combatantId: c.id, characterId: c.characterId }
      : { name: c.label, combatantId: c.id, characterId: null },
  );
}

function resolve({
  words,
  targets,
  selected,
}: {
  words: string[];
  targets: Target[];
  selected: string | null;
}): Target | string {
  if (!words.length) return targets.find((t) => t.combatantId === selected) ?? "No target: select a row or type a name";
  const q = words.join(" ").toLowerCase();
  // An exact name wins, so "Ork" is reachable next to "Ork Nob".
  const exact = targets.filter((t) => t.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0]!;
  const hits = targets.filter((t) => {
    const n = t.name.toLowerCase();
    return n === q || n.startsWith(q) || n.split(/[\s×()]+/).some((w) => w.startsWith(q));
  });
  if (hits.length === 1) return hits[0]!;
  return hits.length ? `Ambiguous: ${hits.map((h) => h.name).join(", ")}` : `No combatant matches "${words.join(" ")}"`;
}

export function parseCommand({
  input,
  state: s,
  selected,
}: {
  input: string;
  state: LiveState;
  selected: string | null;
}): Parsed {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { actions: [] };
  const [first, second] = words.map((w) => w.toLowerCase());

  if (words.length === 1 && first === "end") return { actions: [{ type: "turn.end" }] };
  if (words.length === 1 && first === "round") return { actions: [{ type: "encounter.newRound" }] };
  if ((first === "glory" || first === "ruin") && second && /^[+-]?\d+$/.test(second))
    return { actions: [{ type: "pool.adjust", pool: first, delta: Number(second) }] };

  const targets = targetsOf(s);
  let verb: string | null = null,
    amount: number | null = null,
    condition: { name: string; on: boolean } | null = null;
  const rest: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    const cond = /^([+-])(.+)$/.exec(w);
    const condName = cond && CONDITIONS.find((c) => c.toLowerCase().replace(/\s/g, "") === cond[2]!.toLowerCase());
    if (condName) condition = { name: condName, on: cond![1] === "+" };
    else if (/^[+-]\d+$/.test(w) && !verb) {
      verb = w.startsWith("+") ? "wounds" : "heal";
      amount = Math.abs(Number(w));
    } else if (/^[+-]?\d+$/.test(w) && verb)
      amount = Number(w); // `wrath -1`, `dmg +3`
    else if (VERBS[lw] && !verb) verb = VERBS[lw]!;
    else rest.push(w);
  }
  if (!verb && !condition) return { error: `Unknown command. Try: <name> dmg 3 · <name> +2 · +Pinned <name> · end` };

  const t = resolve({ words: rest, targets, selected });
  if (typeof t === "string") return { error: t };
  const n = amount ?? 1;

  if (condition) {
    const current = t.characterId
      ? (s.characters.find((c) => c.id === t.characterId)?.conditions ?? [])
      : (s.encounter?.combatants.flatMap((c) => (c.id === t.combatantId && c.kind === "threat" ? c.conditions : [])) ??
        []);
    const next = condition.on
      ? [...new Set([...current, condition.name])]
      : current.filter((c) => c !== condition!.name);
    return {
      actions: [
        t.characterId
          ? { type: "character.update", id: t.characterId, conditions: next }
          : { type: "combatant.update", id: t.combatantId, conditions: next },
      ],
    };
  }

  if (verb && verb in COUNTER_ACTIONS) {
    const { field, sign } = COUNTER_ACTIONS[verb as CounterAction];
    const delta = sign * Math.abs(n); // the verb sets the direction: `heal -2` still heals
    return {
      actions: [
        t.characterId
          ? { type: "character.adjust", id: t.characterId, [field]: delta }
          : { type: "combatant.adjust", id: t.combatantId, [field]: delta },
      ],
    };
  }

  switch (verb) {
    case "wrath":
      return t.characterId
        ? { actions: [{ type: "character.adjust", id: t.characterId, wrath: amount ?? 1 }] }
        : { error: "Threats don't have Wrath" };
    case "start":
      return { actions: [{ type: "turn.start", id: t.combatantId }] };
    case "seize":
      return { actions: [{ type: "turn.seize", id: t.combatantId }] };
    case "aware":
      return { actions: [{ type: "combatant.aware", id: t.combatantId }] };
    case "ambush":
      return { actions: [{ type: "combatant.update", id: t.combatantId, ambushed: true }] };
    // What the phones show (rules-flow §11.53): hide = nothing, show = bars, reveal = the stat block too.
    case "reveal":
      return { actions: [{ type: "combatant.update", id: t.combatantId, visibility: "stats" }] };
    case "show":
      return { actions: [{ type: "combatant.update", id: t.combatantId, visibility: "bars" }] };
    case "hide":
      return { actions: [{ type: "combatant.update", id: t.combatantId, visibility: "hidden" }] };
    case "mob":
      return amount === null
        ? { error: "mob needs a count: <name> mob 6" }
        : { actions: [{ type: "combatant.update", id: t.combatantId, mobCount: amount }] };
    case "remove":
      return { actions: [{ type: "combatant.remove", id: t.combatantId }] };
  }
  return { error: "Unknown command" };
}
