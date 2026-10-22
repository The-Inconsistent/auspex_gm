"use client";
import type { Codex, LiveState, ScenePresets, Threat } from "@wg/shared";

import { SceneHazards } from "@/components/gm/prep/components/scene-hazards/scene-hazards";
import { ScenePools } from "@/components/gm/prep/components/scene-pools/scene-pools";
import { TEST_RULES } from "@/components/gm/prep/constants";
import { sceneNumber } from "@/components/gm/prep/utils";
import { Mentions } from "@/components/ui/mentions/mentions";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import type { Send } from "@/hooks/use-table/use-table";

import type { Report, SceneBeat } from "../../types";
import { TestRows } from "../test-rows/test-rows";

type ScenePageProps = {
  state: LiveState;
  codex: Codex;
  beat: SceneBeat;
  index: number;
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  agents: LiveState["characters"]; // those holding a seat, for a called Test
  onReport: Report;
  onEdit: (beatId: string) => void;
};

// The scene as the book prints it, in the book's order: the label line, GOAL, READ ALOUD, GM NOTES on a closed plate,
// HAZARDS, TESTS, RUIN & GLORY. Everything the GM needs to run it, nothing to edit; EDIT leaves for STORY.
export function ScenePage({
  state,
  codex,
  beat,
  index,
  send,
  bestiary,
  presets,
  agents,
  onReport,
  onEdit,
}: ScenePageProps) {
  const place = codex.locations.find((l) => l.id === beat.locationId);
  const label = [`SCENE ${sceneNumber(index)}`, beat.type.toUpperCase(), place?.name.toUpperCase()].filter(Boolean);
  return (
    <section className="scene-page" aria-label="The scene, as printed">
      <div className="scene-label">
        <span className="label">{label.join(" · ")}</span>
        <span className="scene-fill" />
        <button
          type="button"
          className="btn sm"
          aria-label={`Edit ${beat.title} in STORY`}
          onClick={() => onEdit(beat.id)}
        >
          EDIT
        </button>
      </div>
      <h2 className="scene-title">{beat.title}</h2>
      {beat.goal && (
        <div className="scene-goal">
          <span className="label accent">GOAL</span>
          <b>
            <Mentions text={beat.goal} self={beat.id} />
          </b>
        </div>
      )}
      {beat.readAloud && (
        <div className="scene-read">
          <span className="scene-read-tag">READ ALOUD</span>
          <p>
            <Mentions text={beat.readAloud} self={beat.id} />
          </p>
        </div>
      )}
      {beat.gmNotes && (
        // Closed, so a player glancing at the tablet doesn't read what is really going on.
        <details className="field plate">
          <summary className="label">GM NOTES · TAP TO REVEAL</summary>
          <pre className="text">
            <Mentions text={beat.gmNotes} self={beat.id} />
          </pre>
        </details>
      )}
      {place && (
        <SceneHazards
          beat={beat}
          place={place}
          tables={presets.hazards}
          bestiary={bestiary}
          tier={state.campaign.tier}
          send={send}
          onReport={onReport}
        />
      )}
      {beat.tests.length > 0 && (
        <div className="scene-sect">
          <div className="scene-sect-head">
            <span className="label accent">TESTS</span>
            <span className="dim">tap a row to call it · the phones report back</span>
            <span className="scene-fill" />
            {TEST_RULES.map(([id, label]) => (
              <RuleIdLink key={id} id={id}>
                <span className="chip">{label}</span>
              </RuleIdLink>
            ))}
          </div>
          <TestRows tests={beat.tests} characters={state.characters} agents={agents} send={send} onReport={onReport} />
        </div>
      )}
      {beat.ruin.length + beat.glory.length + beat.spends.length > 0 && (
        <ScenePools
          beat={beat}
          pools={state.campaign}
          players={state.characters.length}
          send={send}
          onReport={onReport}
        />
      )}
    </section>
  );
}
