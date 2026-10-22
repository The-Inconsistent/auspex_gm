import type { Codex } from "@wg/shared";

import { sceneNumber } from "@/components/gm/prep/utils";
import { exitNumber, readiness, sceneFixes, tagline } from "@/lib/story-scenes/story-scenes";

import type { Adventure } from "../../types";
import { SceneGlance } from "./components/scene-glance/scene-glance";

type SceneBoardProps = {
  adv: Adventure;
  codex: Codex;
  threatNames: Map<string, string>;
  selectedId: string | null; // the card whose glance panel shows; null or a stranger's id means the first scene
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onRun: (id: string) => void;
};

// The adventure's scenes in story order, hung on an iron spine like Traitor's Hymn p.26, with the selected scene's glance
// panel beside it. A card is one button that selects the scene; its exits sit beside it as tags, crimson where they lead
// nowhere yet.
export function SceneBoard({ adv, codex, threatNames, selectedId, onSelect, onOpen, onRun }: SceneBoardProps) {
  const order = adv.beats.map((b) => b.id);
  if (!order.length) return <p className="dim">No scenes yet. Add one below.</p>;

  const found = adv.beats.findIndex((b) => b.id === selectedId);
  const selected = found >= 0 ? found : 0;
  const picked = adv.beats[selected];

  return (
    <div className="story-board">
      <ol className="story-spine" aria-label={`${adv.title} scenes in story order`}>
        {adv.beats.map((b, i) => {
          const fixes = sceneFixes(b, order);
          const npcNames = codex.npcs.filter((n) => b.npcIds.includes(n.id)).map((n) => n.name);
          return (
            <li key={b.id} id={`entry-${b.id}`} className="story-row">
              <button
                className="story-card"
                aria-pressed={i === selected}
                title={fixes.join(" · ")}
                onClick={() => onSelect(b.id)}
              >
                <span className="story-card-head">
                  <span className="story-num">{sceneNumber(i)}</span>
                  <b className="story-card-title">{b.title.toUpperCase()}</b>
                </span>
                <span className="story-tagline">{tagline(b, { npcNames, threatNames })}</span>
                <span className="story-card-foot">
                  <span className={`chip ${fixes.length ? "warn" : ""}`}>{readiness(fixes)}</span>
                  {i === selected && <span className="chip story-picked">SELECTED</span>}
                  {b.status !== "planned" && (
                    <span className={`chip ${b.status === "active" ? "warn" : ""}`}>{b.status.toUpperCase()}</span>
                  )}
                </span>
              </button>
              <ul className="story-exits" aria-label="Exits">
                {b.exits.map((e, j) => {
                  const to = exitNumber(e.beatId, order);
                  return (
                    <li key={j} className={`story-exit ${to ? "" : "none"}`} title={e.label}>
                      <span className="sr-only">{e.label}: </span>→ {to ?? "NO SCENE YET"}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {picked && (
        <SceneGlance beat={picked} index={selected} order={order} codex={codex} onOpen={onOpen} onRun={onRun} />
      )}
    </div>
  );
}
