"use client";
import { Side, UNSEEN_ID, deriveStats, sideOf, threatStatus, type Combatant, type LiveState } from "@wg/shared";

import { Bar } from "@/components/ui/bar/bar";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { Track } from "@/components/ui/track/track";
import { useTable } from "@/hooks/use-table/use-table";

import "./table-screen.css";

type TableScreenProps = { campaignId: string };

// Whose side is up: the side of whoever is acting, else the side that picks next. upNext was worked out server-side
// before hidden threats were dropped (toPlayerView); sideUpNext on this view would miss their Turns.
function sideUp(enc: NonNullable<LiveState["encounter"]>): Side | null {
  if (enc.currentId === UNSEEN_ID) return "threats";
  const acting = enc.combatants.find((c) => c.id === enc.currentId);
  return acting ? sideOf(acting) : (enc.upNext ?? null);
}

// The TV in the middle of the table: a read-only view of the player snapshot (no controls, no book pages, no Ruin), in
// type big enough to read across the table. The seat is a "screen" guest token, which gets toPlayerView(state, null).
export function TableScreen({ campaignId }: TableScreenProps) {
  const { state, online } = useTable(campaignId); // useTable keeps the screen awake (wake lock)
  if (!state) return <StatusScreen text="SYNCING…" />;

  const enc = state.encounter;
  const up = enc ? sideUp(enc) : null;
  const chars = new Map(state.characters.map((c) => [c.id, c]));
  const rows = (side: Side) => enc?.combatants.filter((c) => sideOf(c) === side) ?? [];

  const row = (c: Combatant) => {
    const now = c.id === enc?.currentId;
    const cls = `ts-row ${sideOf(c)} ${now ? "now" : ""} ${c.acted ? "done" : ""}`;
    if (c.kind === "pc") {
      const ch = chars.get(c.characterId);
      const d = ch && deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier });
      return (
        <div key={c.id} className={cls}>
          <b className="ts-name display">
            {now ? "▶ " : ""}
            {(ch?.name ?? "?").toUpperCase()}
          </b>
          {ch && d && (
            <div className="ts-bars">
              <span>
                WND <Bar value={ch.wounds} max={d.maxWounds} danger={ch.wounds > 0} />
              </span>
              <span>
                SHK <Bar value={ch.shock} max={d.maxShock} danger={ch.shock > 0} />
              </span>
            </div>
          )}
        </div>
      );
    }
    // A threat shows the bar the GM allows (blocks, not counts), as on the phones' FIGHT tab.
    return (
      <div key={c.id} className={cls}>
        <b className="ts-name display">
          {now ? "▶ " : ""}
          {c.label.toUpperCase()}
        </b>
        {c.mobCount !== null ? (
          <span className="bar">
            ×{c.mobCount} OF {c.mobStart}
          </span>
        ) : (
          <Track value={Math.max(0, c.maxWounds - c.wounds)} max={c.maxWounds} label={`${c.label} Wounds`} />
        )}
        <div className="ts-bars">
          <StatusChips items={threatStatus(c)} />
          {c.conditions.map((k) => (
            <span key={k} className="chip">
              {k.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="ts">
      {!online && <div className="badge-offline">NO SIGNAL</div>}
      <header className="ts-head">
        <div>
          <div className="label">{state.campaign.name.toUpperCase()}</div>
          <div className={`ts-side display ${up ?? ""}`}>{!enc ? "NO FIGHT" : up ? `${up.toUpperCase()} UP` : "—"}</div>
        </div>
        <div className="ts-facts">
          {enc && (
            <div className="ts-fact">
              <div className="label">ROUND</div>
              <div className="ts-num display">{enc.round}</div>
            </div>
          )}
          <div className="ts-fact">
            <div className="label">GLORY</div>
            <div className="ts-num display">{state.campaign.glory}</div>
          </div>
        </div>
      </header>
      {enc && (
        <div className="ts-cols">
          {Side.options.map((side) => (
            <section key={side} className="ts-col" aria-label={side}>
              <div className="label">{side.toUpperCase()}</div>
              {rows(side).map(row)}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
