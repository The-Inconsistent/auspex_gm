"use client";
import { useState } from "react";

import {
  ATTRIBUTES,
  SKILLS,
  corruptionLabel,
  corruptionLevel,
  deriveStats,
  effectiveStrength,
  pcStatus,
  poolMax,
  rankOf,
  skillTotal,
  type ActionInput,
  type Character,
  type CharacterDetail,
  type LiveState,
  type Skill,
} from "@wg/shared";

import { ATTRIBUTE_NAMES, BUILD_STEP_PARAM } from "@/components/builder/constants";
import { DetailFields, DetailHelp, DetailView, hasDetail } from "@/components/ui/character-detail/character-detail";
import { Legend } from "@/components/ui/legend/legend";
import { PageCite } from "@/components/ui/page-cite/page-cite";
import { Refusal } from "@/components/ui/refusal/refusal";
import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { SupplyRow } from "./components/supply-row/supply-row";
import { UpgradeRow } from "./components/upgrade-row/upgrade-row";
import { Vital } from "./components/vital/vital";
import { SHEET_COUNTERS, SHEET_LEGEND } from "./constants";

// `table` is the live game; without it (the invite page, before a seat) the sheet is read-only.
export type SheetProps = {
  me: Character;
  tier: LiveState["campaign"]["tier"];
  table?: { state: LiveState; send: Send };
};

export function Sheet({ me, tier, table }: SheetProps) {
  const s = me.stats;
  const d = deriveStats({ stats: s, overrides: me.overrides, tier });
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Partial<CharacterDetail> | null>(null); // the text being edited, or null
  const { get } = useRules();
  // What the XP looks like from here: earned in play, what advancement hasn't spent yet, and Rank (Core p.146, +1 per
  // 40 XP earned, at most 3). The server keeps `xpSpent` from the last saved build, so no catalogue is needed to show it.
  const toSpend = Math.max(0, me.xp - me.xpSpent);
  const rank = rankOf(me.xp);
  // Where XP is spent: the builder's ADVANCE screen for a character already made (Core pp.146–151), the builder from the
  // top for one that isn't. LEVEL UP and the button at the foot of the sheet are the same trip, so they share this.
  const buildHref = table
    ? `/c/${table.state.campaign.id}/build/${me.id}${me.build ? `?${BUILD_STEP_PARAM}=advance` : ""}`
    : null;
  // Each rule under the sheet's own label (RSLV, not Resolve), so a player finds what they're looking at.
  const legend = SHEET_LEGEND.flatMap(([abbr, id]) => {
    const r = get(id);
    return r ? [{ ...r, abbr }] : [];
  });

  // Sends an action; a refusal (e.g. no Respite while Dying, p.197) shows the server's reason.
  const run = async (a: ActionInput) => {
    if (!table) return;
    const r = await table.send(a);
    setError(r.ok ? null : r.error);
  };

  // − on Wealth, or on one Ammo type. Only the GM grants them (PARTY).
  const supply = (change: { wealth?: number; ammo?: { kind: string; delta: number } }) =>
    run({ type: "character.supply", id: me.id, ...change });

  // SAVE on the detail: writes it and closes the editor, or keeps it open with the server's reason.
  const saveDetail = async () => {
    if (!detail || !table) return;
    const r = await table.send({ type: "character.update", id: me.id, detail });
    setError(r.ok ? null : r.error);
    if (r.ok) setDetail(null);
  };

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
        <i className="dim">{[s.archetype, s.species, `Tier ${tier}`].filter(Boolean).join(" · ")}</i>
        {s.keywords.length > 0 && <div className="kw">{s.keywords.join(" · ")}</div>}
        <div className="sheet-xp">
          <span>
            <span className="label">XP EARNED</span> <b>{me.xp}</b>
          </span>
          <span>
            <span className="label">TO SPEND</span> <b>{toSpend}</b>
          </span>
          <span>
            <span className="label">RANK</span> <b>{rank}</b>
          </span>
          {toSpend > 0 && buildHref && me.build && (
            <a className="badge-up" href={buildHref}>
              LEVEL UP · SPEND {toSpend} XP
            </a>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="rule">
          <span>WHO YOU ARE</span>
          <DetailHelp />
        </div>
        {detail ? (
          <>
            <DetailFields idPrefix="sheet-detail" value={detail} onChange={setDetail} />
            <div className="keys" style={{ paddingTop: 0 }}>
              <button className="btn sm primary" onClick={saveDetail}>
                SAVE
              </button>
              <button className="btn sm" onClick={() => setDetail(null)}>
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            {hasDetail(me.detail) ? (
              <DetailView detail={me.detail} />
            ) : (
              <div className="dim">Appearance, past, personality: not written yet.</div>
            )}
            {table && (
              <div>
                <button className="btn sm" onClick={() => setDetail(me.detail)}>
                  {hasDetail(me.detail) ? "EDIT" : "WRITE"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <StatusChips items={pcStatus(me, d)} />
      </div>

      <div className="vitals">
        <Vital label={SHEET_COUNTERS.wounds.label} value={me.wounds} max={d.maxWounds} remaining danger />
        <Vital label={SHEET_COUNTERS.shock.label} value={me.shock} max={d.maxShock} remaining />
        <Vital label={SHEET_COUNTERS.wrath.label} value={me.wrath} max={null} />
        {table && (
          <Vital
            label="PARTY GLORY"
            value={table.state.campaign.glory}
            max={poolMax("glory", table.state.characters.length)}
          />
        )}
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        WRATH: reroll failed dice · narrative declaration · restore {"Rank + Tier"} Shock (p.164).
      </div>

      <div className="rule">
        <span>TRAITS</span>
        {legend.length > 0 && <Legend title="Reading your sheet" entries={legend} inline />}
      </div>
      <div className="traits">
        {traits.map(([k, v]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>

      {/* Read-only: the GM sets Conditions from the tracker or PARTY. The name opens the rule. */}
      {me.conditions.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="rule">CONDITIONS</div>
          <div className="keys" style={{ paddingTop: 0 }}>
            {me.conditions.map((k) => (
              <span key={k} className="cond">
                <RuleLink name={k}>
                  <span>{k.toUpperCase()}</span>
                </RuleLink>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* From the GM, to this Agent only (toPlayerView blanks everyone else's). Closed by default so a phone left
          on the table doesn't show them to the player beside it. */}
      {me.objectives.length > 0 && (
        <details className="item">
          <summary className="rule">SECRET OBJECTIVES · TAP TO REVEAL</summary>
          <div className="stack" style={{ gap: 6 }}>
            {me.objectives.map((o, i) => (
              <div key={i} className={o.done ? "dim" : undefined}>
                <span style={{ textDecoration: o.done ? "line-through" : undefined }}>{o.text}</span>
                {o.done && <span className="sr-only"> (done)</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {(s.weapons.length > 0 || s.armour.name) && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="rule">ARMAMENT</div>
          {s.weapons.map((w) => (
            <div key={w.name}>
              <b>{w.name.toUpperCase()}</b>
              <div className="dim" style={{ fontSize: 13 }}>
                <WeaponLine weapon={w} strength={effectiveStrength(s)} />
              </div>
              {table && <UpgradeRow me={me} item={w} send={table.send} onRefusal={setError} />}
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
              {/* What a fitted upgrade leaves to the GM, the way a weapon's notes read (Core p.227, §11.65). */}
              {s.armour.notes?.map((n) => (
                <div key={n} className="dim wpn-note" style={{ fontSize: 13 }}>
                  {n}
                </div>
              ))}
              {table && <UpgradeRow me={me} item={s.armour} host="armour" send={table.send} onRefusal={setError} />}
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="rule">SUPPLY</div>
        <SupplyRow label="Wealth" value={s.wealth} onMinus={table && (() => supply({ wealth: -1 }))} />
        {Object.entries(s.ammo).map(([kind, n]) => (
          <SupplyRow
            key={kind}
            label={`${kind} ammo`}
            value={n}
            removable
            onMinus={table && (() => supply({ ammo: { kind, delta: -1 } }))}
          />
        ))}
        <div className="dim" style={{ fontSize: 12 }}>
          AMMO: 1 per Reload (p.185), each type fits its own weapons (p.229). WEALTH: 1 per Icon on an Influence Test
          (p.206). The GM grants both.
        </div>
      </div>

      {/* Read-only here: the GM keeps the tally (PARTY), and `toPlayerView` sends it to its own Agent only. Core pp.285–287. */}
      <div className="stack" style={{ gap: 4 }}>
        <div className="rule">CORRUPTION</div>
        <div className="keys" style={{ alignItems: "center" }}>
          <b>{s.corruption}</b>
          <span className={`chip ${corruptionLevel(s.corruption).modifier > 0 ? "warn" : ""}`}>
            {corruptionLabel(s.corruption)}
          </span>
        </div>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        <div className="rule">ATTRIBUTES AND SKILLS</div>
        <div className="label" style={{ display: "flex" }}>
          <span style={{ flex: 1 }} />
          <span style={{ width: 64, textAlign: "right" }}>RATING</span>
          <span style={{ width: 64, textAlign: "right" }}>DICE</span>
        </div>
        {/* A Test rolls Skill + Attribute (Core p.21), so an unrated Skill still rolls its Attribute: shown greyed. */}
        {ATTRIBUTES.map((a) => (
          <div key={a} className="stack" style={{ gap: 2 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span className="display" style={{ flex: 1, letterSpacing: "0.12em" }}>
                {ATTRIBUTE_NAMES[a].toUpperCase()}
              </span>
              <span className="display" style={{ width: 64, textAlign: "right", fontSize: 22 }}>
                {s.attributes[a]}
              </span>
              <span style={{ width: 64 }} />
            </div>
            {(Object.keys(SKILLS) as Skill[])
              .filter((k) => SKILLS[k] === a)
              .map((k) => (
                <div
                  key={k}
                  className={s.skills[k] ? undefined : "dim"}
                  style={{ display: "flex", alignItems: "baseline", paddingLeft: 16 }}
                >
                  <span style={{ flex: 1 }}>{k}</span>
                  <span style={{ width: 64, textAlign: "right" }}>{s.skills[k] ?? 0}</span>
                  <span className="display" style={{ width: 64, textAlign: "right", fontSize: 22 }}>
                    {skillTotal(s, k)}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {rulesLists.map(
        ([title, list]) =>
          list.length > 0 && (
            <div key={title} className="stack" style={{ gap: 6 }}>
              <div className="rule">{title}</div>
              {list.map((r) => (
                <div key={r.name}>
                  <b>{r.name}</b>
                  {r.page && (
                    <span className="dim">
                      {" "}
                      (<PageCite cite={r.page} />)
                    </span>
                  )}
                  {r.text && <div style={{ fontSize: 13 }}>{r.text}</div>}
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
      {buildHref && (
        <div>
          <a className="btn" href={buildHref}>
            {me.build ? "SPEND XP (BUILDER)" : "CHARACTER BUILDER"}
          </a>
        </div>
      )}
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
