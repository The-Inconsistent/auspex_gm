import type { Weapon } from "@wg/shared";

// One-line weapon profile without its traits: `7 +2 ED · AP -1 · R 1` (WeaponLine renders the traits as rule links).
// Melee wargear with `addStrength` prints S+X, resolved to a number when the wielder's Strength is known.
export function weaponProfile({
  weapon: w,
  strength,
}: {
  weapon: Weapon & { addStrength?: boolean };
  strength?: number;
}) {
  const dmg = w.addStrength ? (strength !== undefined ? `${strength + w.damage}` : `S+${w.damage}`) : `${w.damage}`;
  const parts = [
    `${dmg} +${w.ed} ED`,
    w.ap ? `AP ${w.ap}` : null,
    `R ${w.range.join("/")}`,
    w.salvo === undefined ? null : `S ${w.salvo ?? "–"}`,
  ];
  return parts.filter(Boolean).join(" · ");
}
