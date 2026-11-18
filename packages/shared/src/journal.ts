import type { Action } from "./actions.ts";

// One row of the GM's journal list (the `journal` socket event, GM room only, newest first). `label` is `journalLabel` with the
// server's names filled in. `undoneBy` set: reverted (UNDO on it is refused). `undoes` set: this entry is an undo, and
// undoing it is a redo.
export type JournalItem = {
  id: string;
  at: string; // ISO time
  type: Action["type"];
  label: string;
  undoneBy: string | null;
  undoes: string | null;
};

// GET /api/campaigns/:id/sessions/:sessionId/recap-draft: the lines `draftRecap` made from that session's journal.
export type RecapDraft = { lines: string[] };

// A name for a row id (a character, combatant, item, codex entry or entry of the journal), or undefined when unknown.
// The server builds one per request from the live rows and the journal's row images (journal.service.ts).
export type NameOf = (id: string) => string | undefined;

const signed = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`);
const upper1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "+2 Wounds, −1 Shock": the counters of one adjust action, in the order the tracker shows them.
function deltas(parts: [number | undefined, string][]) {
  return parts
    .filter(([n]) => n)
    .map(([n, word]) => `${signed(n!)} ${word}`)
    .join(", ");
}

// A short line for the GM's history list: what the action did, in the tracker's wording. Only what the payload says
// (names come from `name`, "someone" when unknown); it never works out a result, so no rules are in here.
export function journalLabel(a: Action, name: NameOf): string {
  const who = (id: string, fallback = "Someone") => name(id) ?? fallback;
  switch (a.type) {
    case "combatant.adjust":
      return `${who(a.id)}: ${
        deltas([
          [a.wounds, "Wounds"],
          [a.shock, "Shock"],
          [a.personalRuin, "Personal Ruin"],
        ]) || "no change"
      }`;
    case "character.adjust": {
      const traumatic = a.traumatic
        ? `${signed(a.traumatic)} Traumatic ${Math.abs(a.traumatic) === 1 ? "Injury" : "Injuries"}`
        : "";
      const rest = deltas([
        [a.wounds, "Wounds"],
        [a.shock, "Shock"],
        [a.wrath, "Wrath"],
      ]);
      return `${who(a.id)}: ${[rest, traumatic].filter(Boolean).join(", ") || "no change"}`;
    }
    case "pool.adjust":
      return `${upper1(a.pool)} ${signed(a.delta)}`;
    case "turn.start":
      return `${who(a.id)} acting`;
    case "turn.seize":
      return `Seize: ${who(a.id)} acting`;
    case "turn.end":
      return "Turn ended";
    case "encounter.start":
      return "Encounter started";
    case "encounter.end":
      return "Encounter ended";
    case "encounter.newRound":
      return "New Round";
    case "encounter.begin":
      return "Begin Round 1";
    case "encounter.ambush":
      return `${upper1(a.side)} ${a.ambushed ? "ambushed" : "not ambushed"}`;
    case "turn.hold":
      return "Turn ended, action held";
    case "turn.interrupt":
      return `${who(a.id)} interrupts`;
    case "turn.mark":
      return `${who(a.id)}: ${a.acted ? "done" : "not yet"}`;
    case "turn.back":
      return "Turn back";
    case "combatant.manifest":
      return `${who(a.id)} manifests ${a.power}`;
    case "beat.begin":
      return `Begin ${name(a.id) ?? "a scene"}`;
    case "whisper.send":
      return `Whisper to ${a.to.map((id) => who(id, "an Agent")).join(", ")}`;
    case "beat.startEncounter":
      return `Start the encounter of ${name(a.id) ?? "a scene"}`;
    case "combatant.addThreat":
      return `Add ${a.label ?? name(a.threatId) ?? a.threatId}${a.mobCount ? ` x${a.mobCount}` : ""} to the fight`;
    case "combatant.addCharacter":
      return `Add ${who(a.characterId, "an Agent")} to the fight`;
    case "combatant.remove":
      return `Remove ${who(a.id, "a combatant")} from the fight`;
    case "combatant.aware":
      return `${who(a.id)} aware`;
    case "combatant.update":
      return `${who(a.id)}: ${a.ambushed ? "ambushed" : a.conditions ? "Conditions changed" : "changed"}`;
    case "character.create":
      return `Add Agent ${a.name}`;
    case "character.update":
      return `Update ${who(a.id, "an Agent")}`;
    case "character.delete":
      return `Delete ${who(a.id, "an Agent")}`;
    case "character.giveItem":
      return `Give ${name(a.itemId) ?? "an item"} to ${who(a.id, "an Agent")}`;
    case "character.takeItem":
      return `Take ${name(a.itemId) ?? "an item"} from ${who(a.id, "an Agent")}`;
    case "codex.save": {
      const title = "name" in a.data ? a.data.name : "title" in a.data ? a.data.title : undefined;
      return `${a.id ? "Edit" : "Add"} ${a.kind}${title ? ` ${title}` : ""}`;
    }
    case "codex.delete":
      return `Delete ${a.kind} ${name(a.id) ?? ""}`.trim();
    case "session.start":
      return "Session started";
    case "session.end":
      return "Session ended";
    case "journal.undo":
      return name(a.entryId) ? `Undo \u201c${name(a.entryId)}\u201d` : "Undo";
    default:
      // The type is the label when nothing better is written: "character.fitUpgrade" -> "Character fit upgrade".
      // The UI says SCENE where the code keeps `beat`.
      return upper1(
        a.type
          .replace(/^beat\./, "scene.")
          .replace(/\./g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toLowerCase(),
      );
  }
}

// What a recap needs of a journal entry: the parsed action, and whether the entry stands.
export type RecapEntry = { action: Action; undoneBy?: string | null; undoes?: string | null };

// Turns one session's journal entries (oldest first; the caller picks them by the session's startedAt..endedAt, since an
// entry carries no session id) into plain recap lines for the GM to edit. Only what the action
// payload says: entries that were undone, and the undo entries themselves, are skipped. A threat is named by its label
// or its bestiary id; with a `name` lookup (the server's, from live rows and the journal's row images) the removed
// combatants and the items given, and to whom, read with names. "Removed" is not "slain": the action doesn't say which.
export function draftRecap(entries: RecapEntry[], name?: NameOf): string[] {
  const live = entries.filter((e) => !e.undoneBy && !e.undoes && e.action.type !== "journal.undo");
  const lines: string[] = [];
  let fights = 0;
  let open = false; // a fight has started and not been written out yet
  let rounds = 0;
  let threats: string[] = [];
  let removed: string[] = [];
  const items: string[] = [];
  const pools: Record<string, number> = {};
  const flush = () => {
    if (!open) return;
    open = false;
    lines.push(`Fight ${fights}${rounds > 1 ? `, ${rounds} Rounds` : ""}: ${threats.join(", ") || "no Threats"}.`);
    if (removed.length)
      lines.push(
        name
          ? `Removed from the fight: ${removed.join(", ")}.`
          : `${removed.length} combatant${removed.length > 1 ? "s" : ""} removed from the fight.`,
      );
    threats = [];
    removed = [];
    rounds = 0;
  };
  for (const { action: a } of live) {
    switch (a.type) {
      case "encounter.start":
      case "beat.startEncounter":
        flush();
        fights++;
        open = true;
        rounds = 1;
        break;
      case "encounter.newRound":
        rounds++;
        break;
      case "encounter.end":
        flush();
        break;
      case "combatant.addThreat":
        {
          const who = a.label ?? name?.(a.threatId) ?? a.threatId;
          threats.push(a.mobCount ? `${who} x${a.mobCount}` : who);
        }
        break;
      case "combatant.remove":
        removed.push(name?.(a.id) ?? "a combatant");
        break;
      case "character.giveItem":
        items.push(`${name?.(a.itemId) ?? "an item"} to ${name?.(a.id) ?? "an Agent"}`);
        break;
      case "pool.adjust":
        // Net, not "spent": a GM correction is the same action as a spend.
        pools[a.pool] = (pools[a.pool] ?? 0) + a.delta;
        break;
      case "session.end":
        flush();
        itemLines(items, lines, name);
        poolLines(pools, lines);
        lines.push(`${a.xp} XP awarded.`);
        return lines;
    }
  }
  flush();
  itemLines(items, lines, name);
  poolLines(pools, lines);
  return lines;
}

function itemLines(items: string[], lines: string[], name?: NameOf) {
  if (!items.length) return;
  lines.push(
    name ? `Given out: ${items.join(", ")}.` : `${items.length} item${items.length > 1 ? "s" : ""} given out.`,
  );
}

function poolLines(pools: Record<string, number>, lines: string[]) {
  for (const [pool, n] of Object.entries(pools))
    if (n) lines.push(`${pool} pool ${n < 0 ? "down" : "up"} ${Math.abs(n)}.`);
}
