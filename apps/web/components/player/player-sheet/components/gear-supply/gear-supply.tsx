"use client";
import { corruptionLevel, effectiveStrength, type ActionInput, type Character } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { SupplyRow } from "@/components/ui/supply-row/supply-row";
import { UpgradeRow } from "@/components/ui/upgrade-row/upgrade-row";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { Heading } from "../heading/heading";

type GearSupplyProps = { me: Character; send: Send; onError: (error: string | null) => void };

// GEAR & SUPPLY: the suit and weapons with their upgrade fitting, gear, Wealth and Ammo (minus only: the GM grants),
// then Corruption and its mutations. Every action is the one the long sheet sends.
export function GearSupply({ me, send, onError }: GearSupplyProps) {
  const s = me.stats;
  const corruption = corruptionLevel(s.corruption);

  // Sends an action; the server's refusal (e.g. no Respite while Dying, p.197) goes up to the sheet's banner.
  const run = async (a: ActionInput) => {
    const r = await send(a);
    onError(r.ok ? null : r.error);
  };

  // − on Wealth, or on one Ammo type. Only the GM grants them (PARTY).
  const supply = (change: { wealth?: number; ammo?: { kind: string; delta: number } }) =>
    run({ type: "character.supply", id: me.id, ...change });

  return (
    <>
      <section className="ps-section" aria-label="Gear and supply">
        <Heading title="GEAR & SUPPLY" id="ps-gear" />
        {s.armour.name && (
          <div className="ps-item">
            <b className="ps-weapon-name">{s.armour.name}</b>{" "}
            <span className="ps-ink2">
              AR <b className="mono">{s.armour.ar}</b>
              {s.armour.invulnerable ? "*" : ""}
              {s.armour.traits.length ? ` · ${s.armour.traits.join(", ")}` : ""}
            </span>
            {/* What a fitted upgrade leaves to the GM, the way a weapon's notes read (Core p.227, §11.65). */}
            {s.armour.notes?.map((n) => (
              <span key={n} className="wpn-note">
                {n}
              </span>
            ))}
            <UpgradeRow me={me} item={s.armour} host="armour" send={send} onRefusal={onError} />
          </div>
        )}
        {s.weapons.map((w) => (
          <div key={w.name} className="ps-item">
            <b className="ps-weapon-name">{w.name}</b>
            <span className="ps-ink2 ps-block-line">
              <WeaponLine weapon={w} strength={effectiveStrength(s)} />
            </span>
            <UpgradeRow me={me} item={w} send={send} onRefusal={onError} />
          </div>
        ))}
        {s.gear.length > 0 && <div className="ps-ink2">{s.gear.join(" · ")}</div>}
        <SupplyRow label="Wealth" value={s.wealth} onMinus={() => supply({ wealth: -1 })} />
        {Object.entries(s.ammo).map(([kind, n]) => (
          <SupplyRow
            key={kind}
            label={`${kind} ammo`}
            value={n}
            removable
            onMinus={() => supply({ ammo: { kind, delta: -1 } })}
          />
        ))}
        <span className="ps-note">
          AMMO: 1 per Reload (p.185), each type fits its own weapons (p.229). WEALTH: 1 per Icon on an Influence Test
          (p.206). You spend; the GM grants both.
        </span>
      </section>

      {/* Corruption (Core p.286): the level and what it adds to the DN of the next Corruption Test. The GM changes it. */}
      <section className="ps-section" aria-label="Corruption">
        <Heading title="CORRUPTION" />
        <SupplyRow label="Corruption" value={s.corruption} />
        <span className="ps-note">
          {corruption.chaosSpawn
            ? "CHAOS SPAWN · THE GM TAKES THIS AGENT OVER (p.286)"
            : `${corruption.name.toUpperCase()} · +${corruption.modifier} TO CORRUPTION TEST DNs (p.286)`}
        </span>
        {/* Mutations (Core pp.287–295): what changes a number is already counted on this sheet; the rest is the GM's. */}
        {s.mutations.map((m) => (
          <div key={m.id} className="ps-item">
            <b className="ps-weapon-name">{m.name}</b>{" "}
            <span className="ps-cite">
              (<PageCite cite={`Core p.${m.page}`} />)
            </span>
            <div className="ps-pre">{m.effect}</div>
            {m.weapons.map((w) => (
              <WeaponLine key={w.name} weapon={w} strength={effectiveStrength(s)} />
            ))}
          </div>
        ))}
      </section>
    </>
  );
}
