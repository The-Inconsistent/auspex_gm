import { weaponAtStrength } from "@wg/shared";

import type { ThreatDraft } from "../../constants";

export type DraftWeapon = NonNullable<NonNullable<ThreatDraft["abilities"]>[number]["weapons"]>[number];

// What a weapon-table cell holds as typed, and the profile value it commits. `null` from a parser means "not a value
// yet": the cell keeps the text and is marked, and the profile keeps its last good number.
export type Parsed<T> = { value: T } | null;

const DIGITS = /^\d+$/;

export const damageText = (n: number) => String(n);
export const parseDamage = (s: string): Parsed<number> => (DIGITS.test(s.trim()) ? { value: Number(s.trim()) } : null);

// ED is a number of dice, or a roll like "1d3" on some weapons (Weapon.ed).
export const edText = (ed: number | string) => String(ed);
export function parseEd(s: string): Parsed<number | string> {
  const t = s.trim().toLowerCase();
  if (DIGITS.test(t)) return { value: Number(t) };
  return /^\d*d\d+([+-]\d+)?$/.test(t.replace(/\s/g, "")) ? { value: t.replace(/\s/g, "") } : null;
}

// AP prints as a negative number, or not at all. "2" is read as -2: nobody types the sign on a tablet.
export const apText = (ap: number | undefined) => (ap ? String(ap) : "");
export function parseAp(s: string): Parsed<number | undefined> {
  const t = s.trim().replace(/[–−]/g, "-");
  if (t === "" || t === "0" || t === "-0") return { value: undefined };
  const m = /^-?(\d+)$/.exec(t);
  return m ? { value: -Number(m[1]) } : null;
}

// RANGE: MELEE (a reach of 1), one number, or short / medium / long (Weapon.range, Core p.207).
export const rangeText = (r: number[]) => (r.length === 1 && r[0] === 1 ? "MELEE" : r.join(" / "));
export function parseRange(s: string): Parsed<number[]> {
  const t = s.trim().toUpperCase();
  if (t === "MELEE") return { value: [1] };
  const parts = t.split(/[\s/,-]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3 || !parts.every((p) => DIGITS.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every((n) => n > 0) ? { value: nums } : null;
}

// SALVO: a number, "–" for a printed dash, or blank where the book prints none (a melee weapon).
export const salvoText = (s: number | null | undefined) => (s === undefined ? "" : s === null ? "–" : String(s));
export function parseSalvo(s: string): Parsed<number | null | undefined> {
  const t = s.trim();
  if (t === "") return { value: undefined };
  if (t === "-" || t === "–") return { value: null };
  return DIGITS.test(t) ? { value: Number(t) } : null;
}

// A new Strength carries every weapon that follows it (rules-flow.md §11.165).
export function withStrength(d: ThreatDraft, s: number): ThreatDraft {
  const S = { from: d.attributes.S, to: s };
  const move = <A extends { weapons?: DraftWeapon[] }>(list: A[] | undefined) =>
    list?.map((a) => ({ ...a, weapons: a.weapons?.map((w) => weaponAtStrength(w, S)) }));
  return {
    ...d,
    attributes: { ...d.attributes, S: s },
    abilities: move(d.abilities),
    mobAbilities: move(d.mobAbilities),
  };
}
