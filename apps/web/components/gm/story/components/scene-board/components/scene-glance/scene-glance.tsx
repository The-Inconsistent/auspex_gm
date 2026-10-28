import type { Codex } from "@wg/shared";

import { useGm } from "@/components/gm/gm-app/gm-context";
import { sceneNumber } from "@/components/gm/prep/utils";
import { objectivesAt } from "@/lib/scene/scene";
import { onEntryNames, privateHandouts, sceneFixes } from "@/lib/story-scenes/story-scenes";

import type { Adventure } from "../../../../types";

type SceneGlanceProps = {
  beat: Adventure["beats"][number];
  index: number; // its place in the adventure
  order: string[]; // the adventure's scene ids in story order
  codex: Codex;
  onOpen: (id: string) => void;
  onRun: (id: string) => void;
};

// SCENE nn AT A GLANCE: what the selected scene holds and whether it can be run, beside the spine. OPEN goes to its page;
// RUN FROM HERE begins it.
export function SceneGlance({ beat: b, index, order, codex, onOpen, onRun }: SceneGlanceProps) {
  const nn = sceneNumber(index);
  const fixes = sceneFixes(b, order);
  const place = codex.locations.find((l) => l.id === b.locationId)?.name;
  const priv = privateHandouts(b, codex.handouts);
  const shown = onEntryNames(b, codex);
  const missions = objectivesAt(useGm().state.characters, { adventureId: b.adventureId, beatId: b.id }).length;
  const rows: [string, string][] = [
    ["CAST", String(b.npcIds.length)],
    ["HANDOUTS", `${b.handoutIds.length}${priv ? ` · ${priv} PRIVATE` : ""}`],
    ["ITEMS", String(b.itemIds.length)],
    ["TESTS", String(b.tests.length)],
    ["FIGHT IF IT BREAKS OUT", String(b.encounter.length)],
    ["EXITS", String(b.exits.length)],
    ["AGENT OBJECTIVES", String(missions)],
  ];

  return (
    <aside className="panel story-glance" aria-label={`Scene ${nn} at a glance`}>
      <span className="label">
        {[`SCENE ${nn}`, b.type.toUpperCase(), place?.toUpperCase()].filter(Boolean).join(" · ")}
      </span>
      <h3 className="story-glance-title">{b.title}</h3>
      {b.goal.trim() && (
        <p className="story-glance-goal">
          <b>GOAL</b> {b.goal}
        </p>
      )}
      <dl className="story-glance-counts">
        {rows.map(([k, v]) => (
          <div key={k} className="story-glance-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="story-glance-entry">
        <b>SHOWN ON ENTRY</b> {shown.length ? shown.join(", ") : "nothing ticked"}
      </p>
      <div className="story-glance-ready">
        <b>READY FOR THE TABLE</b>
        {fixes.length ? (
          <ul>
            {fixes.map((f) => (
              <li key={f} className="story-glance-fix">
                ✕ {f}
              </li>
            ))}
          </ul>
        ) : (
          <span>READY ✓</span>
        )}
      </div>
      <button className="btn primary" onClick={() => onOpen(b.id)}>
        OPEN SCENE {nn}
      </button>
      {b.status === "active" ? (
        <span className="chip warn">BEING PLAYED</span>
      ) : (
        <button className="btn" onClick={() => onRun(b.id)}>
          ▶ RUN FROM HERE
        </button>
      )}
    </aside>
  );
}
