"use client";
import { useState, type FormEvent } from "react";

import {
  AMMO_TYPES,
  CONDITIONS,
  SKILLS,
  deriveStats,
  effectiveStrength,
  pcStatus,
  poolMax,
  skillTotal,
  type ActionInput,
  type Character,
  type LiveState,
  type Skill,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { SupplyRow } from "./components/supply-row/supply-row";
import { Vital } from "./components/vital/vital";
import { SHEET_COUNTERS } from "./constants";

type SheetProps = { me: Character; state: LiveState; send: Send };

export function Sheet({ me, state, send }: SheetProps) {
  const s = me.stats;
  const d = deriveStats({ stats: s, overrides: me.overrides, tier: state.campaign.tier });
  const [pickCond, setPickCond] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAmmo, setNewAmmo] = useState("");
  const players = state.characters.length;

  // Sends an action; a refusal (e.g. no Respite while Dying, p.197) shows the server's reason.
  const run = async (a: ActionInput) => {
    const r = await send(a);
    setError(r.ok ? null : r.error);
  };

  // − / + on Wealth, or on one Ammo type.
  const supply = (change: { wealth?: number; ammo?: { kind: string; delta: number } }) =>
    run({ type: "character.supply", id: me.id, ...change });

  // + AMMO: starts a new type (or tops up an existing one) at +1.
  const handleAddAmmo = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const kind = newAmmo.trim();
    if (!kind) return;
    void supply({ ammo: { kind, delta: 1 } });
    setNewAmmo("");
  };

  // Condition chip: adds the Condition, or removes it if already on.
  const toggleCond = (k: string) =>
    run({
      type: "character.update",
      id: me.id,
      conditions: me.conditions.includes(k) ? me.conditions.filter((x) => x !== k) : [...me.conditions, k],
    });

  const traits = [
    ["DEF", d.defence],
    ["RES", d.resilience],
    ["RSLV", d.resolve],
    ["CONV", d.conviction],
    ["SPD", d.speed],
    ["INF", d.influence],
    ["PAS", d.passiveAwareness],
  ] as const;
  const rulesLists = [
    ["ABILITIES", s.abilities],
    ["TALENTS", s.talents],
  ] as const;

  return (
    <>
      <div>
        <div className="display" style={{ fontSize: 30, lineHeight: 1.05 }}>
          {me.name.toUpperCase()}
        </div>
        <i className="dim">{[s.archetype, s.species, `Tier ${state.campaign.tier}`].filter(Boolean).join(" · ")}</i>
        {s.keywords.length > 0 && <div className="kw">{s.keywords.join(" · ")}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <StatusChips items={pcStatus(me, d)} />
      </div>

      <div className="vitals">
        <Vital label={SHEET_COUNTERS.wounds.label} value={me.wounds} max={d.maxWounds} remaining danger />
        <Vital label={SHEET_COUNTERS.shock.label} value={me.shock} max={d.maxShock} remaining />
        <Vital label={SHEET_COUNTERS.wrath.label} value={me.wrath} max={null} />
        <Vital label="PARTY GLORY" value={state.campaign.glory} max={poolMax("glory", players)} />
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        WRATH: reroll failed dice · narrative declaration · restore {"Rank + Tier"} Shock (p.164). GM RUIN:{" "}
        {state.campaign.ruin}
      </div>

      <div className="traits">
        {traits.map(([k, v]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="rule">CONDITIONS</div>
        <div className="keys" style={{ paddingTop: 0 }}>
          {/* The name opens the rule and × removes it: two controls, so reading a rule never drops the Condition. */}
          {me.conditions.map((k) => (
            <span key={k} role="group" aria-label={k} className="cond">
              <RuleLink name={k}>
                <span>{k.toUpperCase()}</span>
              </RuleLink>
              <button aria-label={`Remove ${k}`} onClick={() => toggleCond(k)}>
                ×
              </button>
            </span>
          ))}
          <button className="btn sm" onClick={() => setPickCond(!pickCond)}>
            {pickCond ? "DONE" : "+ COND"}
          </button>
        </div>
        {pickCond && (
          <div className="keys">
            {CONDITIONS.filter((k) => !me.conditions.includes(k)).map((k) => (
              <button key={k} className="btn sm" onClick={() => toggleCond(k)}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>

      {s.weapons.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="rule">ARMAMENT</div>
          {s.weapons.map((w) => (
            <div key={w.name}>
              <b>{w.name.toUpperCase()}</b>
              <div className="dim" style={{ fontSize: 13 }}>
                <WeaponLine weapon={w} strength={effectiveStrength(s)} />
              </div>
            </div>
          ))}
          {s.armour.name && (
            <div>
              <b>{s.armour.name.toUpperCase()}</b>{" "}
              <span className="dim">
                AR {s.armour.ar}
                {s.armour.invulnerable ? "*" : ""}
                {s.armour.traits.length ? ` · ${s.armour.traits.join(", ")}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="rule">SUPPLY</div>
        <SupplyRow
          label="Wealth"
          value={s.wealth}
          onMinus={() => supply({ wealth: -1 })}
          onPlus={() => supply({ wealth: 1 })}
        />
        {Object.entries(s.ammo).map(([kind, n]) => (
          <SupplyRow
            key={kind}
            label={`${kind} ammo`}
            value={n}
            removable
            onMinus={() => supply({ ammo: { kind, delta: -1 } })}
            onPlus={() => supply({ ammo: { kind, delta: 1 } })}
          />
        ))}
        <form style={{ display: "flex", gap: 6 }} onSubmit={handleAddAmmo}>
          <input
            className="input"
            list="ammo-types"
            aria-label="New ammo type"
            value={newAmmo}
            onChange={(e) => setNewAmmo(e.target.value)}
            placeholder="AMMO TYPE"
          />
          <datalist id="ammo-types">
            {AMMO_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button className="btn sm">+ AMMO</button>
        </form>
        <div className="dim" style={{ fontSize: 12 }}>
          AMMO: 1 per Reload (p.185), each type fits its own weapons (p.229). WEALTH: 1 per Icon on an Influence Test
          (p.206).
        </div>
      </div>

      {Object.keys(s.skills).length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">SKILLS (dice)</div>
          {(Object.keys(SKILLS) as Skill[])
            .filter((k) => s.skills[k])
            .map((k) => (
              <div key={k} style={{ display: "flex" }}>
                <span style={{ flex: 1 }}>{k}</span>
                <span className="display" style={{ fontSize: 22 }}>
                  {skillTotal(s, k)}
                </span>
              </div>
            ))}
        </div>
      )}

      {rulesLists.map(
        ([title, list]) =>
          list.length > 0 && (
            <div key={title} className="stack" style={{ gap: 6 }}>
              <div className="rule">{title}</div>
              {list.map((r) => (
                <div key={r.name}>
                  <b>{r.name}</b>
                  {r.page && <span className="dim"> ({r.page})</span>}
                  <div style={{ fontSize: 13 }}>{r.text}</div>
                </div>
              ))}
            </div>
          ),
      )}
      {s.gear.length > 0 && (
        <div className="dim" style={{ fontSize: 13 }}>
          GEAR: {s.gear.join(" · ")}
        </div>
      )}
      <div>
        <a className="btn" href={`/c/${state.campaign.id}/build/${me.id}`}>
          {me.build ? "SPEND XP (BUILDER)" : "CHARACTER BUILDER"}
        </a>
      </div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
