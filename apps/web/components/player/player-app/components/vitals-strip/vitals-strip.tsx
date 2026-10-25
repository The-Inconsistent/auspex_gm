"use client";
import { ChevronRight } from "lucide-react";

import { deriveStats, pcStatus, poolMax, type Character, type LiveState } from "@wg/shared";

import { RuleIdLink, RuleLink } from "@/components/ui/rule-link/rule-link";
import { RequestSpend } from "@/components/ui/request-spend/request-spend";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Track } from "@/components/ui/track/track";
import type { Send } from "@/hooks/use-table/use-table";

import { SHEET_COUNTERS, STRIP_RULES } from "../../constants";

type VitalsStripProps = {
  me: Character;
  state: LiveState;
  send: Send;
  // Scrolled down: one line, so the page keeps its room (canvas board "SHEET · scrolled").
  folded: boolean;
  onOpenSheet: () => void;
};

// The Agent's counters under the banner on every tab: what's left of Wounds and Shock, Wrath, the party's Glory, and
// the Conditions. Read-only like the sheet's cards (only the GM changes them); Wrath and Glory open a spend request
// (§11.122).
export function VitalsStrip({ me, state, send, folded, onOpenSheet }: VitalsStripProps) {
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier: state.campaign.tier });
  const wounds = Math.max(0, d.maxWounds - me.wounds);
  const shock = Math.max(0, d.maxShock - me.shock);
  const glory = state.campaign.glory;
  const status = pcStatus(me, d);

  if (folded)
    return (
      <button type="button" className="pl-strip-line" onClick={onOpenSheet} aria-label={`${me.name}: open the sheet`}>
        <span className="display">{me.name.toUpperCase()}</span>
        <span className="mono">
          W <b>{wounds}</b>/{d.maxWounds} · S <b>{shock}</b>/{d.maxShock} · WR <b>{me.wrath}</b> · GL <b>{glory}</b>
        </span>
        {me.conditions.length + status.length > 0 && (
          <span className="mono pl-strip-flag">{me.conditions.length + status.length}</span>
        )}
      </button>
    );

  return (
    <div className="pl-strip">
      <button type="button" className="pl-strip-who" onClick={onOpenSheet}>
        <span>
          <span className="display">{me.name.toUpperCase()}</span>
          <i>{[me.stats.archetype, me.stats.species].filter(Boolean).join(" · ")}</i>
        </span>
        <ChevronRight size={18} aria-hidden />
      </button>
      <div className="pl-vts">
        <div className="pl-vt">
          <RuleIdLink id={STRIP_RULES.wounds}>
            <span className="label">{SHEET_COUNTERS.wounds.label}</span>
          </RuleIdLink>
          <span className="mono pl-vn">
            {wounds}
            <small>/{d.maxWounds}</small>
          </span>
          <Track value={wounds} max={d.maxWounds} tone="harm" />
        </div>
        <div className="pl-vt">
          <RuleIdLink id={STRIP_RULES.shock}>
            <span className="label">{SHEET_COUNTERS.shock.label}</span>
          </RuleIdLink>
          <span className="mono pl-vn">
            {shock}
            <small>/{d.maxShock}</small>
          </span>
          <Track value={shock} max={d.maxShock} tone="ink" />
        </div>
        {/* The label reads the pool's rule; the rest of the cell asks the GM to spend from it. */}
        <div className="pl-vt tap">
          <RuleIdLink id={STRIP_RULES.wrath}>
            <span className="label">{SHEET_COUNTERS.wrath.label}</span>
          </RuleIdLink>
          <RequestSpend
            pool="wrath"
            state={state}
            characterId={me.id}
            send={send}
            className="pl-vt-btn"
            label={
              <>
                <span className="mono pl-vn">{me.wrath}</span>
                <span className="mono pl-vs">SPEND ›</span>
              </>
            }
          />
        </div>
        <div className="pl-vt tap glory">
          <RuleIdLink id={STRIP_RULES.glory}>
            <span className="label">GLORY</span>
          </RuleIdLink>
          <RequestSpend
            pool="glory"
            state={state}
            characterId={me.id}
            send={send}
            className="pl-vt-btn"
            label={
              <>
                <span className="mono pl-vn">
                  {glory}
                  <small>/{poolMax("glory", state.characters.length)}</small>
                </span>
                <span className="mono pl-vs">PARTY ›</span>
              </>
            }
          />
        </div>
      </div>
      {me.conditions.length + status.length > 0 && (
        <div className="pl-strip-chips">
          <StatusChips items={status} />
          {me.conditions.map((k) => (
            <RuleLink key={k} name={k}>
              <span className="chip">{k.toUpperCase()}</span>
            </RuleLink>
          ))}
        </div>
      )}
    </div>
  );
}
