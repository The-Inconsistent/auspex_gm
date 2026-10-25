"use client";
import { Package, Shield } from "lucide-react";
import { Fragment } from "react";

import { effectiveStrength, type ActionInput, type Character, type DerivedStats } from "@wg/shared";

import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { SupplyRow } from "@/components/ui/supply-row/supply-row";
import { Term } from "@/components/ui/term/term";
import { UpgradeRow } from "@/components/ui/upgrade-row/upgrade-row";
import type { Send } from "@/hooks/use-table/use-table";
import { weaponPool, weaponSkill } from "@/lib/sheet-pools/sheet-pools";

import { WEAPON_SKILL_TAGS } from "../../constants";
import { BookBox } from "../book-box/book-box";

// `live`: the seated player's own sheet, with its spends and upgrade fitting. Without it (the JOIN page's READ) the box
// is read-only: the datacard, armour and kit only.
type WargearProps = {
  me: Character;
  live?: { d: DerivedStats; send: Send; onError: (error: string | null) => void };
};

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

// The book's WARGEAR box (Core p.40) holding our Kill Team datacard (one row per weapon: what it is, the dice to attack
// with, its damage and AP, then its reach and traits), then the armour, the rest of the kit, and the sheet's foot:
// Supply, Influence and Wealth. Every column head opens its meaning (lib/sheet-terms); traits open their rule where the
// seat is served one. Fitting an upgrade (Core p.227) sits under the datacard, shown only when one can be fitted or
// taken off.
export function Wargear({ me, live }: WargearProps) {
  const s = me.stats;
  const strength = effectiveStrength(s);
  // READ of an Agent with no kit: no box (the seated DOSSIER always has its Supply and Influence foot).
  if (!live && s.weapons.length === 0 && !s.armour.name && s.gear.length === 0) return null;

  // − on Wealth, or on one Ammo type: the player spends, only the GM grants (PARTY). A refusal goes up to the banner.
  const supply = async (change: { wealth?: number; ammo?: { kind: string; delta: number } }) => {
    if (!live) return;
    const a: ActionInput = { type: "character.supply", id: me.id, ...change };
    const r = await live.send(a);
    live.onError(r.ok ? null : r.error);
  };

  return (
    <BookBox title="WARGEAR" id="ps-wargear" label="Wargear">
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
                    {/* Why the numbers differ from the book's, as WeaponLine says it: fitted upgrades (Core p.227), the
                        Talents and abilities worked in (§11.68), and what an upgrade leaves to the GM (§11.65). */}
                    {(w.upgradeNames ?? []).length > 0 && <> · {w.upgradeNames!.join(", ")}</>}
                    {(w.effects ?? []).length > 0 && <> · with {w.effects!.join(", ")}</>}
                  </span>
                  {w.notes?.map((n) => (
                    <span key={n} className="wpn-note">
                      {n}
                    </span>
                  ))}
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
            {/* What a fitted upgrade leaves to the GM, the way a weapon's notes read (Core p.227, §11.65). */}
            {s.armour.notes?.map((n) => (
              <span key={n} className="wpn-note">
                {n}
              </span>
            ))}
          </span>
        </div>
      )}
      {live && s.armour.name && (
        <UpgradeRow me={me} item={s.armour} host="armour" named send={live.send} onRefusal={live.onError} />
      )}
      {live &&
        s.weapons.map((w) => (
          <UpgradeRow key={w.name} me={me} item={w} named send={live.send} onRefusal={live.onError} />
        ))}
      {s.gear.length > 0 && <span className="bs-lbl bs-gear-h">GEAR</span>}
      {s.gear.map((g, i) => (
        <div key={i} className="wg-kit">
          <Package size={18} aria-hidden="true" />
          <span>{g}</span>
        </div>
      ))}
      {live && (
        <>
          <div className="bs-gear-foot">
            <div className="bs-supply">
              <span className="bs-lbl">SUPPLY</span>
              {Object.entries(s.ammo).map(([kind, n]) => (
                <SupplyRow
                  key={kind}
                  label={`${kind} ammo`}
                  value={n}
                  removable
                  onMinus={() => void supply({ ammo: { kind, delta: -1 } })}
                />
              ))}
              <SupplyRow label="Wealth" value={s.wealth} onMinus={() => void supply({ wealth: -1 })} />
            </div>
            <div className="bs-cell">
              <span className="bs-lbl">
                <Term k="influence">INFLUENCE</Term>
              </span>
              <span className="bs-v mono">{live.d.influence}</span>
            </div>
          </div>
          <span className="ps-note">
            AMMO: 1 per Reload (p.185), each type fits its own weapons (p.229). <Term k="wealth">WEALTH</Term>: 1 per
            Icon on an Influence Test (p.206). You spend; the GM grants both.
          </span>
        </>
      )}
    </BookBox>
  );
}
