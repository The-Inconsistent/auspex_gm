import { ATTITUDE_DN, quickRow, quickScaling, type Codex, type QuickRow, type Threat } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import type { Send } from "@/hooks/use-table/use-table";

import { AddToScene } from "./components/add-to-scene/add-to-scene";

type NpcCardProps = {
  npc: Codex["npcs"][number];
  adventures: Codex["adventures"];
  bestiary: Threat[];
  tier: number;
  players: number;
  send: Send;
  onError: (e: string | null) => void;
};

const QUICK_COLUMNS: [keyof QuickRow, string][] = [
  ["skills", "DEFAULT SKILLS"],
  ["defence", "DEF"],
  ["resilience", "RES"],
  ["wounds", "WND"],
  ["shock", "SHK"],
  ["conviction", "CONV"],
  ["resolve", "RESOLVE"],
  ["speed", "SPD"],
];

// An opened NPC's stats (issue #47): its Attitude's DN modifier (Core p.168), then the bestiary stat block, or Core
// p.326's Quick NPC row with the Scaling Threats lines beside it, since a Quick NPC isn't fielded (rules-flow §11.88).
export function NpcCard({ npc, adventures, bestiary, tier, players, send, onError }: NpcCardProps) {
  const s = npc.statSource;
  const dn = ATTITUDE_DN[npc.attitude];
  return (
    <>
      {dn !== 0 && (
        <div className="field">
          <span className="label">ATTITUDE · CORE P.168</span>
          <div className="text">
            {npc.attitude.toUpperCase()}: {dn > 0 ? `add ${dn} to` : `take ${-dn} from`} the DN of a social Test against
            this NPC.
          </div>
        </div>
      )}
      {s.kind === "bestiary" && <BestiaryStats threat={bestiary.find((t) => t.id === s.threatId)} tier={tier} />}
      {s.kind === "quick" && <QuickStats source={s} tier={tier} players={players} />}
      <AddToScene npc={npc} adventures={adventures} send={send} onError={onError} />
    </>
  );
}

function BestiaryStats({ threat, tier }: { threat: Threat | undefined; tier: number }) {
  if (!threat) return <div className="dim">The stat block isn&apos;t in the loaded bestiary.</div>;
  return <StatBlock t={threat} tier={tier} />;
}

type QuickStatsProps = {
  source: Extract<Codex["npcs"][number]["statSource"], { kind: "quick" }>;
  tier: number;
  players: number;
};

function QuickStats({ source, tier, players }: QuickStatsProps) {
  const { row } = quickRow(source.tier);
  const scaled = quickScaling({ row, tier, players });
  return (
    <div className="sb">
      <div className="sb-title">
        <span>QUICK NPC · TIER {source.tier}</span>
        <i>
          <PageCite cite="Core p.326" />
        </i>
      </div>
      <div
        className="sb-grid sb-shade"
        style={{ gridTemplateColumns: `repeat(${QUICK_COLUMNS.length}, minmax(0, 1fr))` }}
      >
        {QUICK_COLUMNS.map(([k, label]) => (
          <span key={k} className="label">
            {label}
          </span>
        ))}
        {QUICK_COLUMNS.map(([k]) => (
          <span key={k} className="sb-v">
            {row[k]}
          </span>
        ))}
      </div>
      {tier > 4 && source.tier === 4 && (
        <div className="sb-body dim">The Tier 4 row: the table stops at Tier 4 (rules-flow §11.86).</div>
      )}
      {source.specialty && (
        <div className="sb-body">
          <span className="label">SPECIALTY </span>
          {source.specialty.skill} {source.specialty.dice}
        </div>
      )}
      <div className="sb-body">
        <span className="label">SCALING (P.326) </span>
        Troop {scaled.troop.wounds} Wound, {scaled.troop.shock} Shock · Elite {scaled.elite.wounds} Wounds,{" "}
        {scaled.elite.shock} Shock · Adversary {scaled.adversary.wounds} Wounds, {scaled.adversary.shock} Shock
      </div>
    </div>
  );
}
