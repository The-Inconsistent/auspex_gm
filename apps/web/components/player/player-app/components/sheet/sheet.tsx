"use client";
import { useState } from "react";

import {
  CONDITIONS, SKILLS, deriveStats, effectiveStrength, pcStatus, poolMax, skillTotal,
  type ActionInput, type Character, type LiveState, type Skill,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import type { Send } from "@/hooks/use-table/use-table";
import { weaponLine } from "@/lib/weapon-line/weapon-line";

import { Vital } from "./components/vital/vital";
import { SHEET_COUNTERS, type SheetCounter } from "./constants";

type SheetProps = { me: Character; state: LiveState; send: Send };

export function Sheet({ me, state, send }: SheetProps) {
  const s = me.stats;
  const d = deriveStats({ stats: s, overrides: me.overrides, tier: state.campaign.tier });
  const [pickCond, setPickCond] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = state.characters.length;

  // Sends an action; a refusal (e.g. no Respite while Dying, p.197) shows the server's reason.
  const run = async (a: ActionInput) => {
    const r = await send(a);
    setError(r.ok ? null : r.error);
  };

  // − / + on Wounds, Shock or Wrath.
  const adj = (field: SheetCounter, delta: number) => run({ type: "character.adjust", id: me.id, [field]: delta });

  // − / + on the shared Glory pool.
  const adjGlory = (delta: number) => run({ type: "pool.adjust", pool: "glory", delta });

  // Condition chip: adds the Condition, or removes it if already on.
  const toggleCond = (k: string) =>
    run({ type: "character.update", id: me.id, conditions: me.conditions.includes(k) ? me.conditions.filter((x) => x !== k) : [...me.conditions, k] });

  const traits = [
    ["DEF", d.defence], ["RES", d.resilience], ["RSLV", d.resolve], ["CONV", d.conviction],
    ["SPD", d.speed], ["INF", d.influence], ["PAS", d.passiveAwareness],
  ] as const;
  const rulesLists = [["ABILITIES", s.abilities], ["TALENTS", s.talents]] as const;

  return (
    <>
      <div>
        <div className="display" style={{ fontSize: 38, lineHeight: 1 }}>{me.name.toUpperCase()}</div>
        <div className="label">{[s.archetype, s.species, `T${state.campaign.tier}`].filter(Boolean).join(" · ")}</div>
        {s.keywords.length > 0 && <div className="dim" style={{ fontSize: 12 }}>{s.keywords.join(", ")}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><StatusChips items={pcStatus(me, d)} /></div>

      <div className="vitals">
        <Vital label={SHEET_COUNTERS.wounds.label} value={me.wounds} max={d.maxWounds} onMinus={() => adj("wounds", -1)} onPlus={() => adj("wounds", 1)} danger />
        <Vital label={SHEET_COUNTERS.shock.label} value={me.shock} max={d.maxShock} onMinus={() => adj("shock", -1)} onPlus={() => adj("shock", 1)} />
        <Vital label={SHEET_COUNTERS.wrath.label} value={me.wrath} max={null} onMinus={() => adj("wrath", -1)} onPlus={() => adj("wrath", 1)} />
        <Vital label="PARTY GLORY" value={state.campaign.glory} max={poolMax("glory", players)} onMinus={() => adjGlory(-1)} onPlus={() => adjGlory(1)} />
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        WRATH: reroll failed dice · narrative declaration · restore {"Rank + Tier"} Shock (p.164). GM RUIN: {state.campaign.ruin}
      </div>

      <div className="traits">
        {traits.map(([k, v]) => (
          <div key={k}><span className="label">{k}</span><span className="v">{v}</span></div>
        ))}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <div className="rule">── CONDITIONS ──</div>
        <div className="keys" style={{ paddingTop: 0 }}>
          {me.conditions.map((k) => <button key={k} className="btn sm" aria-label={`Remove ${k}`} onClick={() => toggleCond(k)}>{k.toUpperCase()} ×</button>)}
          <button className="btn sm" onClick={() => setPickCond(!pickCond)}>{pickCond ? "DONE" : "+ COND"}</button>
        </div>
        {pickCond && <div className="keys">{CONDITIONS.filter((k) => !me.conditions.includes(k)).map((k) => <button key={k} className="btn sm" onClick={() => toggleCond(k)}>{k}</button>)}</div>}
      </div>

      {s.weapons.length > 0 && <div className="stack" style={{ gap: 6 }}>
        <div className="rule">── ARMAMENT ──</div>
        {s.weapons.map((w) => <div key={w.name}><b>{w.name.toUpperCase()}</b><div className="dim" style={{ fontSize: 13 }}>{weaponLine({ weapon: w, strength: effectiveStrength(s) })}</div></div>)}
        {s.armour.name && <div><b>{s.armour.name.toUpperCase()}</b> <span className="dim">AR {s.armour.ar}{s.armour.invulnerable ? "*" : ""}{s.armour.traits.length ? ` · ${s.armour.traits.join(", ")}` : ""}</span></div>}
      </div>}

      {Object.keys(s.skills).length > 0 && <div className="stack" style={{ gap: 4 }}>
        <div className="rule">── SKILLS (dice) ──</div>
        {(Object.keys(SKILLS) as Skill[]).filter((k) => s.skills[k]).map((k) => (
          <div key={k} style={{ display: "flex" }}><span style={{ flex: 1 }}>{k}</span><span className="display" style={{ fontSize: 22 }}>{skillTotal(s, k)}</span></div>
        ))}
      </div>}

      {rulesLists.map(([title, list]) => list.length > 0 && (
        <div key={title} className="stack" style={{ gap: 6 }}>
          <div className="rule">── {title} ──</div>
          {list.map((r) => <div key={r.name}><b>{r.name}</b>{r.page && <span className="dim"> ({r.page})</span>}<div style={{ fontSize: 13 }}>{r.text}</div></div>)}
        </div>
      ))}
      {s.gear.length > 0 && <div className="dim" style={{ fontSize: 13 }}>GEAR: {s.gear.join(" · ")}</div>}
      <div><button className="btn" onClick={() => run({ type: "character.respite", id: me.id })}>RESPITE (6h rest: Wounds/Shock 0, Wrath 2)</button></div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
