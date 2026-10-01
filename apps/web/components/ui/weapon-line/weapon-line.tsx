"use client";
import { Fragment } from "react";

import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { weaponProfile } from "@/lib/weapon-line/weapon-line";

type WeaponLineProps = Parameters<typeof weaponProfile>[0];

// `10 +1 ED · AP -1 · R 12/24/36 · S 2 · Brutal`, with each trait a tap away from its rule. A weapon with upgrades
// fitted (Core p.227) names them after its traits, and prints what they leave to the GM under the line: an upgrade is
// not a Trait, so neither goes through RuleLink.
export function WeaponLine({ weapon, strength }: WeaponLineProps) {
  const upgrades = "upgradeNames" in weapon ? (weapon.upgradeNames ?? []) : [];
  const notes = "notes" in weapon ? (weapon.notes ?? []) : [];
  return (
    <>
      {weaponProfile({ weapon, strength })}
      {weapon.traits.map((t, i) => (
        <Fragment key={i}>
          {i ? ", " : " · "}
          <RuleLink name={t} />
        </Fragment>
      ))}
      {upgrades.length > 0 && <span className="dim"> · {upgrades.join(", ")}</span>}
      {notes.map((n, i) => (
        <span className="wpn-note" key={i}>
          {n}
        </span>
      ))}
    </>
  );
}
