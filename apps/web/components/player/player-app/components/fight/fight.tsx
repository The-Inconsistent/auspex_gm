"use client";
import { useMemo, useState } from "react";

import { deriveStats, threatStatus, type LiveState } from "@wg/shared";

import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { blocks } from "@/lib/blocks/blocks";

type FightProps = { state: LiveState };

export function Fight({ state }: FightProps) {
  const [open, setOpen] = useState<string | null>(null);
  const chars = useMemo(() => new Map(state.characters.map((c) => [c.id, c])), [state.characters]);
  const enc = state.encounter;
  if (!enc) return <p className="dim">No combat right now.</p>;

  // Threat card header: expand its stat block, or collapse it if already open.
  const toggleOpen = (id: string) => setOpen(open === id ? null : id);

  return (
    <div className="list">
      {enc.combatants.map((c) => {
        const now = c.id === enc.currentId;
        const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
        const name = c.kind === "pc" ? (ch?.name ?? "?") : c.label;
        const d = ch ? deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier }) : null;
        const head = (
          <>
            <b style={{ flex: 1 }}>
              {now ? "▶ " : ""}
              {name.toUpperCase()}
            </b>
            <span className="dim">
              {c.kind === "pc" ? "AGENT" : "THREAT"}
              {c.acted ? " · DONE" : ""}
            </span>
          </>
        );
        // Only the header is a button, so the expanded stat block isn't read out as the button's name.
        return (
          <div
            key={c.id}
            className="item"
            style={{ borderColor: now ? "var(--amber)" : undefined, opacity: c.acted ? 0.6 : 1 }}
          >
            {c.kind === "threat" ? (
              <button className="item-head" aria-expanded={open === c.id} onClick={() => toggleOpen(c.id)}>
                {head}
              </button>
            ) : (
              <div className="item-head">{head}</div>
            )}
            {c.kind === "pc" && ch && d && (
              <span className="bar" style={{ fontSize: 18 }}>
                {blocks({ value: ch.wounds, max: d.maxWounds })}
              </span>
            )}
            {c.kind === "threat" &&
              (c.mobCount !== null ? (
                <span className="bar" style={{ fontSize: 18 }}>
                  ×{c.mobCount} OF {c.mobStart}
                </span>
              ) : (
                <span className="bar" style={{ fontSize: 18 }}>
                  {blocks({ value: c.wounds, max: c.maxWounds })}
                </span>
              ))}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {c.kind === "threat" && <StatusChips items={threatStatus(c)} />}
              {(c.kind === "pc" ? (ch?.conditions ?? []) : c.conditions).map((k) => (
                <span key={k} className="chip">
                  {k.toUpperCase()}
                </span>
              ))}
            </div>
            {open === c.id &&
              c.kind === "threat" &&
              (c.stats ? <StatBlock t={c.stats} /> : <span className="dim">DATA RESTRICTED BY GM.</span>)}
          </div>
        );
      })}
    </div>
  );
}
