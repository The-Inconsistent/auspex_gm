"use client";
import type { ActionResult, Codex, HazardTable, Threat } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { hazardView } from "@/lib/hazards/hazards";

import type { Beat } from "../../types";
import { stripBeat } from "../../utils";
import { HazardChips } from "../hazard-chips/hazard-chips";

type SceneHazardsProps = {
  beat: Beat;
  place: Codex["locations"][number];
  tables: HazardTable[];
  bestiary: Threat[];
  tier: number;
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// The hazards a scene picked from its place (issue #49, rules-flow.md §11.95), closed like the GM notes: players never
// get them. SPOTTED saves on the scene: a hazard the Agents identified in advance earns a lower DN to avoid it, by the
// GM's call, since Threat Assessment p.9 prints no amount (§11.92).
export function SceneHazards({ beat, place, tables, bestiary, tier, send, onReport }: SceneHazardsProps) {
  const picked = beat.hazards.flatMap((pick) => {
    const entry = place.hazardList.find((h) => h.id === pick.id);
    const view = entry && hazardView({ entry, tables, tier });
    return view ? [{ pick, view }] : [];
  });
  if (!picked.length) return null;
  const spotted = picked.filter((x) => x.pick.spotted).length;

  // SPOTTED: flips the hazard's flag on this scene and saves it.
  const toggleSpotted = async (id: string) => {
    const hazards = beat.hazards.map((h) => (h.id === id ? { ...h, spotted: !h.spotted } : h));
    const r = await send({ type: "codex.save", kind: "beat", id: beat.id, data: { ...stripBeat(beat), hazards } });
    onReport(r, "HAZARD SAVED");
  };

  return (
    <details className="field plate">
      <summary className="label">
        HAZARDS · {place.name.toUpperCase()} · {picked.length} · {spotted} SPOTTED · TAP TO REVEAL
      </summary>
      <div className="dim">
        Players never see this. A hazard the Agents spot in advance earns a lower DN on the Test to avoid it; the book
        prints no amount, so you decide (Threat Assessment p.9).
      </div>
      <div className="list">
        {picked.map(({ pick, view }) => (
          <div key={pick.id} className="item stack" style={{ gap: 4 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ flex: 1 }}>
                {view.name.toUpperCase()} <i className="dim">{view.cite}</i>
              </b>
              <button
                className={`btn sm ${pick.spotted ? "primary" : ""}`}
                aria-pressed={pick.spotted}
                onClick={() => toggleSpotted(pick.id)}
              >
                {pick.spotted ? "✓ SPOTTED" : "SPOTTED"}
              </button>
            </div>
            <HazardChips view={view} bestiary={bestiary} tier={tier} />
            {pick.spotted && <i>↓ Spotted: lower the DN (Threat Assessment p.9).</i>}
          </div>
        ))}
      </div>
    </details>
  );
}
