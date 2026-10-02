import type { Codex } from "@wg/shared";

import { mixingHint } from "@/lib/keywords/keywords";

type FactionCardProps = { faction: Codex["factions"][number]; npcs: Codex["npcs"] };

// An opened faction's head (issue #46): its Keywords and stance, the NPCs who belong to it, and Core p.317's reminder
// when the Agents are allied with a non-Imperial faction (rules-flow.md §11.83).
export function FactionCard({ faction, npcs }: FactionCardProps) {
  const members = npcs.filter((n) => n.factionId === faction.id);
  const hint = mixingHint(faction);
  return (
    <>
      <div className="field">
        <span className="label">STANCE · KEYWORDS</span>
        <div className="text">
          {faction.stance.toUpperCase()}
          {faction.keywords.length > 0 && ` · ${faction.keywords.join(" · ")}`}
        </div>
      </div>
      {hint && (
        <div className="field">
          <span className="label">MIXING FACTIONS</span>
          <div className="text">
            {hint.text} <span className="dim">({hint.cite})</span>
          </div>
        </div>
      )}
      <div className="field">
        <span className="label">NPCS</span>
        <div className="text">
          {members.length === 0 && <span className="dim">None yet. Pick this faction on an NPC.</span>}
          {members.map((n, i) => (
            <span key={n.id}>
              {i > 0 && " · "}
              {n.name}
              {!n.revealed && <span className="dim"> (hidden)</span>}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
