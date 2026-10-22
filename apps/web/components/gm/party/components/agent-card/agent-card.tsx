import Image from "next/image";

import { deriveStats, pcStatus, type Character } from "@wg/shared";

import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Track } from "@/components/ui/track/track";
import { objectivesLine, seatLine } from "@/lib/party-view/party-view";
import { portrait } from "@/lib/portraits/portraits";

type AgentCardProps = {
  character: Character;
  tier: number;
  seat: { member: string | null; active: boolean };
  onOpen: () => void;
};

// One Agent on PARTY: state only, and the whole card is the one control (it opens the dossier). Nothing inside it is
// interactive. Wounds and Shock show what's left, as on the tracker, so their tracks drain as harm builds.
export function AgentCard({ character: c, tier, seat, onOpen }: AgentCardProps) {
  const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
  const pic = portrait(c.detail.portrait);
  return (
    <button className="party-card" aria-label={`${c.name}, open dossier`} onClick={onOpen}>
      {pic && <Image src={pic} alt="" height={192} className="portrait-thumb" />}
      <span className="party-card-body">
        <span className="party-card-head">
          <b>{c.name.toUpperCase()}</b>
          <span className="dim">{c.stats.archetype || "NO STATS YET"}</span>
          <span className="label">{seatLine(seat)}</span>
        </span>
        {/* What is left, as the tracker shows it: the bar drains as harm is taken. */}
        <span className="party-card-tracks">
          <span className="party-vital">
            <span className="label">WOUNDS</span>
            <Track value={Math.max(0, d.maxWounds - c.wounds)} max={d.maxWounds} tone="harm" />
            <span>
              {Math.max(0, d.maxWounds - c.wounds)}/{d.maxWounds}
            </span>
          </span>
          <span className="party-vital">
            <span className="label">SHOCK</span>
            <Track value={Math.max(0, d.maxShock - c.shock)} max={d.maxShock} tone="harm" />
            <span>
              {Math.max(0, d.maxShock - c.shock)}/{d.maxShock}
            </span>
          </span>
        </span>
        <span className="party-card-stats">
          <span>
            <span className="label">WRATH</span> {c.wrath}
          </span>
          <span>
            <span className="label">CORRUPTION</span> {c.stats.corruption}
          </span>
          <span>
            <span className="label">WEALTH</span> {c.stats.wealth}
          </span>
          <span>
            <span className="label">XP</span> {c.xp}
          </span>
        </span>
        <span className="party-card-chips">
          {c.conditions.map((k) => (
            <span key={k} className="chip warn">
              {k.toUpperCase()}
            </span>
          ))}
          {c.draft && <span className="chip warn">DRAFT</span>}
          <StatusChips items={pcStatus(c, d)} />
          <span className="chip">{objectivesLine(c.objectives)}</span>
        </span>
      </span>
    </button>
  );
}
