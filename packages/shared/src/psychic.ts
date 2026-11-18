// Sustained psychic powers ride the free-form Conditions list as `Sustaining: <power>`, so they persist, broadcast and
// show as chips with no schema or action of their own (rules-flow §8, §11.180). The app only reminds; the table rolls.
// ponytail: a power is only its name here; a first-class field if powers ever need more (Potency, targets).

const SUSTAIN_PREFIX = "Sustaining: ";
const ENTRY_MAX = 60; // the `conditions` entry cap in actions.ts

// Trimmed and capped so the whole entry fits a Condition (60 chars).
export const sustainEntry = (name: string): string => `${SUSTAIN_PREFIX}${name.trim()}`.slice(0, ENTRY_MAX).trimEnd();

export const isSustain = (k: string): boolean => k.startsWith(SUSTAIN_PREFIX);

export const sustainedPowers = (conditions: string[]): string[] =>
  conditions.filter(isSustain).map((k) => k.slice(SUSTAIN_PREFIX.length));

// +2 DN to all the psyker's Tests per sustained power (Core p.265, rules-flow §8).
export const sustainPenalty = (conditions: string[]): number => 2 * sustainedPowers(conditions).length;

// External damage forces a Willpower Test at DN = Wounds + Shock taken + the penalty, or all sustained powers end
// (Core p.265, rules-flow §8). Null when nothing is sustained or nothing was taken.
const sustainTestDN = ({
  conditions,
  wounds,
  shock,
}: {
  conditions: string[];
  wounds: number;
  shock: number;
}): number | null => {
  const taken = wounds + shock;
  if (!sustainedPowers(conditions).length || taken <= 0) return null;
  return taken + sustainPenalty(conditions);
};

export const sustainHitReminder = ({
  name,
  conditions,
  wounds,
  shock,
}: {
  name: string;
  conditions: string[];
  wounds: number;
  shock: number;
}): string | null => {
  const dn = sustainTestDN({ conditions, wounds, shock });
  if (dn === null) return null;
  const powers = sustainedPowers(conditions);
  return `${name}: hit while sustaining ${powers.length} ${powers.length === 1 ? "power" : "powers"}: Willpower Test DN ${dn}, or all sustained powers end (Core p.265)`;
};

export const sustainTurnReminder = ({ name, conditions }: { name: string; conditions: string[] }): string | null => {
  const powers = sustainedPowers(conditions);
  if (!powers.length) return null;
  return `${name}: sustaining ${powers.join(", ")}: +${sustainPenalty(conditions)} DN to all Tests (Core p.265)`;
};

// The player's own sheet: what they are sustaining and what it costs every Test (Core p.265, rules-flow §8).
export const sustainLine = (conditions: string[]): string | null => {
  const powers = sustainedPowers(conditions);
  if (!powers.length) return null;
  return `SUSTAINING ${powers.join(", ")} · +${sustainPenalty(conditions)} DN to all Tests`;
};

// A psyker's own powers that last while sustained, for the tracker's quick picks (duration as printed).
export const isSustained = (duration: string): boolean => duration.trim().toLowerCase() === "sustained";
