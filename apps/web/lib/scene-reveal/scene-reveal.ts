import type { ActionInput, Codex } from "@wg/shared";

type Beat = Codex["adventures"][number]["beats"][number];

// The codex kinds a scene reveals on entry (Beat.onEntry holds place, NPC and handout ids), each with its collection.
const REVEALABLE = [
  ["npc", "npcs"],
  ["location", "locations"],
  ["handout", "handouts"],
] as const;

// Which revealable entry an id is, with the row; null for an id the codex no longer has.
export function findRevealable(codex: Codex, id: string) {
  for (const [kind, collection] of REVEALABLE) {
    const row = codex[collection].find((r) => r.id === id);
    if (row) return { kind, row };
  }
  return null;
}

// A whole-entry `codex.save` with `revealed` set: codex.save replaces the row, so it carries every field (the server owns
// id and revealedAt). Null when the id isn't a revealable entry.
export function revealAction({
  codex,
  id,
  revealed,
}: {
  codex: Codex;
  id: string;
  revealed: boolean;
}): ActionInput | null {
  const hit = findRevealable(codex, id);
  if (!hit) return null;
  const data: Record<string, unknown> = { ...hit.row, revealed }; // handouts have no revealedAt, so strip by key
  delete data.id;
  delete data.revealedAt;
  return { type: "codex.save", kind: hit.kind, id, data } as ActionInput; // data matches kind, checked by findRevealable
}

// What a beat.begin changed, taken back (the SCENE BEGUN notice's UNDO): the scene left is current again and the begun one
// back to the status it had (OTHER SCENE can begin a done or skipped one); with no scene before, the begun one is saved
// back to that status. Then every entry the begin revealed is sealed.
export function undoBegin({
  codex,
  begun,
  before,
  status,
  revealed,
}: {
  codex: Codex;
  begun: string;
  before: string | null;
  status: Beat["status"];
  revealed: string[];
}): ActionInput[] {
  const beat = codex.adventures.flatMap((a) => a.beats).find((b) => b.id === begun);
  const restore = beat ? [saveBeatStatus(beat, status)] : [];
  // beat.begin leaves the begun scene planned, so only another status needs the save after it.
  const back: ActionInput[] = before
    ? [{ type: "beat.begin", id: before, leave: "planned", reveal: false }, ...(status === "planned" ? [] : restore)]
    : restore;
  const seal = revealed.flatMap((id) => revealAction({ codex, id, revealed: false }) ?? []);
  return [...back, ...seal];
}

function saveBeatStatus(beat: Beat, status: Beat["status"]): ActionInput {
  const { id, order: _order, ...data } = beat;
  return { type: "codex.save", kind: "beat", id, data: { ...data, status } };
}
