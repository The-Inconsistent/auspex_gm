"use client";
import { Package, Shield } from "lucide-react";
import { Fragment } from "react";

import { effectiveStrength, type Character } from "@wg/shared";

import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { Term } from "@/components/ui/term/term";
import { weaponPool, weaponSkill } from "@/lib/sheet-pools/sheet-pools";

import { WEAPON_SKILL_TAGS } from "../../constants";
import { Heading } from "../heading/heading";

type WargearProps = { me: Character };

// Ranged: three rounds, as a Kill Team datacard marks a gun; melee: a blade. Each also says so in words (sr-only).
function WeaponIcon({ melee }: { melee: boolean }) {
  return melee ? (
    <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
      <path fill="currentColor" d="M1 5h15l6-1 1 2-1 2-6-1H1zM13 2h2v8h-2z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
      <path fill="currentColor" d="M2 3h4l1 2v5H2zM9 3h4l1 2v5H9zM16 3h4l1 2v5h-5z" />
    </svg>
  );
}

// WARGEAR as its own section, read like a Kill Team datacard (one row per weapon: what it is, the dice to attack with,
// its damage and AP, then its reach and traits), then the armour and the rest of the kit. Every column head opens its
// meaning (lib/sheet-terms); traits open their rule where the seat is served one.
export function Wargear({ me }: WargearProps) {
  const s = me.stats;
  const strength = effectiveStrength(s);
  if (s.weapons.length === 0 && !s.armour.name && s.gear.length === 0) return null;
  return (
    <section className="ps-section" aria-label="Wargear">
      <Heading title="WARGEAR" id="ps-wargear" />
      {s.weapons.length > 0 && (
        <div className="wg" role="table" aria-label="Weapons">
          <div className="wg-row wg-head" role="row">
            {/* empty but in the grid, so the heads stay over their columns (an sr-only cell would leave it) */}
            <span role="columnheader" aria-label="Kind" />
            <span role="columnheader">NAME</span>
            <span role="columnheader">
              <Term k="dice">DICE</Term>
            </span>
            <span role="columnheader">
              <Term k="damage">DMG</Term>
            </span>
            <span role="columnheader">
              <Term k="ap">AP</Term>
            </span>
          </div>
          {s.weapons.map((w, i) => {
            const skill = weaponSkill(w);
            const melee = skill === "Weapon Skill";
            return (
              <div key={`${w.name}-${i}`} className="wg-row" role="row">
                <span role="cell" className="wg-icon">
                  <WeaponIcon melee={melee} />
                  <span className="sr-only">{melee ? "Melee" : "Ranged"}</span>
                </span>
                <span role="cell" className="wg-name">
                  <b>{w.name}</b>
                  <span className="wg-rules">
                    <Term k="range" /> {w.range.join("/")}
                    {w.salvo !== undefined && (
                      <>
                        {" · "}
                        <Term k="salvo" /> {w.salvo ?? "–"}
                      </>
                    )}
                    {w.traits.map((t, j) => (
                      <Fragment key={j}>
                        {j ? ", " : " · "}
                        <RuleLink name={t} />
                      </Fragment>
                    ))}
                  </span>
                </span>
                <span role="cell" className="wg-pool mono">
                  <small>{WEAPON_SKILL_TAGS[skill]}</small>
                  {weaponPool(s, w)}
                </span>
                <span role="cell" className="wg-dmg mono">
                  {w.addStrength ? strength + w.damage : w.damage}
                  <small>
                    +{w.ed} <Term k="ed">ED</Term>
                  </small>
                </span>
                <span role="cell" className="mono">
                  {w.ap ?? "–"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {s.armour.name && (
        <div className="wg-kit">
          <Shield size={18} aria-hidden="true" />
          <span>
            <b>{s.armour.name}</b> · <Term k="armourRating">AR</Term>{" "}
            <span className="mono">
              {s.armour.ar}
              {s.armour.invulnerable ? "*" : ""}
            </span>
            {s.armour.invulnerable && <> · Invulnerable</>}
            {s.armour.powered > 0 && <> · Powered ({s.armour.powered})</>}
            {s.armour.traits.length > 0 && <> · {s.armour.traits.join(", ")}</>}
          </span>
        </div>
      )}
      {s.gear.map((g, i) => (
        <div key={i} className="wg-kit">
          <Package size={18} aria-hidden="true" />
          <span>{g}</span>
        </div>
      ))}
    </section>
  );
}
