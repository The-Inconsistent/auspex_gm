import type { ActionInput, Character } from "@wg/shared";

// The values a GM taps on an Agent's dossier, each with the action it has always sent: Wounds, Shock and Wrath go
// through the damage rules like the tracker's taps (pp.193–199), Corruption is the GM's plain change (Core p.286),
// Wealth the GM's award or loot (p.206).
export const PAD_FIELDS = {
  wounds: "WOUNDS",
  shock: "SHOCK",
  wrath: "WRATH",
  corruption: "CORRUPTION",
  wealth: "WEALTH",
} as const;
export type PadField = keyof typeof PAD_FIELDS;

// What the pad's −1 / +1 say: Wounds and Shock are shown as what's left, so their steps name the effect (as the tracker's
// DEAL / HEAL); the others are plain counts.
export const PAD_STEPS: Record<PadField, readonly [string, string]> = {
  wounds: ["HEAL 1", "DEAL 1"],
  shock: ["RECOVER 1", "DEAL 1"],
  wrath: ["−1", "+1"],
  corruption: ["−1", "+1"],
  wealth: ["−1", "+1"],
};

// The one action a tap on `field` sends.
export function padAction({ field, id, delta }: { field: PadField; id: string; delta: number }): ActionInput {
  if (field === "corruption") return { type: "character.corrupt", id, delta };
  if (field === "wealth") return { type: "character.supply", id, wealth: delta };
  return { type: "character.adjust", id, [field]: delta };
}

// An Agent's seat, as words: an account (`member`, its name) holds a seat through `membership`; a guest through a QR
// token, which only the `active` set (activeCharacterIds) can tell from no seat at all.
export function seatLine({ member, active }: { member: string | null; active: boolean }): string {
  if (member) return `PLAYED BY ${member.toUpperCase()}`;
  return active ? "SEATED · GUEST QR" : "OPEN SEAT";
}

// "3 OBJECTIVES · 1 DONE", for the card's face.
export function objectivesLine(objectives: Character["objectives"]): string {
  const done = objectives.filter((o) => o.done).length;
  return `${objectives.length} OBJECTIVE${objectives.length === 1 ? "" : "S"} · ${done} DONE`;
}
