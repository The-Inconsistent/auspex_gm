"use client";
import { Fragment } from "react";

import { RuleLink } from "@/components/ui/rules-ref/components/rule-link/rule-link";
import { weaponProfile } from "@/lib/weapon-line/weapon-line";

type WeaponLineProps = Parameters<typeof weaponProfile>[0];

// `10 +1 ED · AP -1 · R 12/24/36 · S 2 · Brutal`, with each trait a tap away from its rule.
export function WeaponLine({ weapon, strength }: WeaponLineProps) {
  return (
    <>
      {weaponProfile({ weapon, strength })}
      {weapon.traits.map((t, i) => (
        <Fragment key={i}>
          {i ? ", " : " · "}
          <RuleLink name={t} />
        </Fragment>
      ))}
    </>
  );
}
