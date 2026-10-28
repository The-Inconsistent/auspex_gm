"use client";
import { Check, Eye } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  activeCharacterIds,
  type ActionResult,
  type BeatStatus,
  type Codex,
  type LiveState,
  type MentionKind,
  type ScenePresets,
  type Threat,
} from "@wg/shared";

import type { BeatSection } from "@/components/gm/prep/components/beat-editor/constants";
import { SceneHazards } from "@/components/gm/prep/components/scene-hazards/scene-hazards";
import { ScenePools } from "@/components/gm/prep/components/scene-pools/scene-pools";
import { SceneTests } from "@/components/gm/prep/components/scene-tests/scene-tests";
import { sceneNumber, stripBeat } from "@/components/gm/prep/utils";
import { holderOf, ItemGive } from "@/components/ui/item-give/item-give";
import { Mentions } from "@/components/ui/mentions/mentions";
import { ReachChip } from "@/components/ui/reach-chip/reach-chip";
import { useMentions } from "@/components/ui/mentions/mentions-provider";
import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import type { Send } from "@/hooks/use-table/use-table";
import { fieldedAgentIds } from "@/lib/print-cards/print-cards";
import { entryLine, exitNumber, readiness, sceneFixes, toggleId } from "@/lib/story-scenes/story-scenes";

import type { Adventure } from "../../types";
import { StorySection } from "../story-section/story-section";

type ScenePageProps = {
  state: LiveState;
  codex: Codex;
  adv: Adventure;
  index: number;
  send: Send;
  bestiary: Threat[];
  presets: ScenePresets;
  threatNames: Map<string, string>;
  onOpen: (id: string) => void; // flip to another scene of this adventure
  onEdit: (section?: BeatSection) => void;
  onRun: () => void;
  onMove: (dir: -1 | 1) => void;
  onStatus: (status: BeatStatus) => void;
  onReport: (r: ActionResult, ok: string) => void;
  onError: (error: string | null) => void;
};

// One scene as a book spread (Flow-StoryPage): what you say and what's really going on on the left; who and what is in
// it on the right. Each part has a pencil that edits just that part, and ▶ RUN THIS SCENE is the one primary.
export function ScenePage({
  state,
  codex,
  adv,
  index,
  send,
  bestiary,
  presets,
  threatNames,
  onOpen,
  onEdit,
  onRun,
  onMove,
  onStatus,
  onReport,
  onError,
}: ScenePageProps) {
  const { print } = usePrint();
  const { get, open } = useMentions();
  const beat = adv.beats[index]!; // the caller picks index from adv.beats
  const order = adv.beats.map((b) => b.id);
  const prev = adv.beats[index - 1];
  const next = adv.beats[index + 1];
  const fixes = sceneFixes(beat, order);
  const seated = activeCharacterIds(state.access); // whose phones a called Test reaches (issue #191)
  const place = codex.locations.find((l) => l.id === beat.locationId);
  const npcs = codex.npcs.filter((n) => beat.npcIds.includes(n.id));
  const handouts = codex.handouts.filter((h) => beat.handoutIds.includes(h.id));
  const items = codex.items.filter((it) => beat.itemIds.includes(it.id));
  const agentName = (id: string) => state.characters.find((c) => c.id === id)?.name ?? "an Agent";

  const [saving, setSaving] = useState(false); // a tick in flight: a second would save over it from the old list

  // ON ENTRY: ticks or unticks one pick and saves the scene at once; a ticked one reaches the phones when it begins.
  const toggleEntry = async (id: string) => {
    const onEntry = toggleId(beat.onEntry, id);
    setSaving(true);
    const r = await send({ type: "codex.save", kind: "beat", id: beat.id, data: { ...stripBeat(beat), onEntry } });
    setSaving(false);
    onReport(r, "ON ENTRY SAVED");
  };

  // A name opens the same peek a mention does, so the GM can reread what a handout says.
  const peek = (kind: MentionKind, id: string) => {
    const entry = get(kind, id);
    if (entry) open(entry);
  };

  // One line per pick, as the design's: the name, a private handout's reach, a dotted leader, then the ON ENTRY box.
  const entryRow = ({ kind, id, name, chip }: { kind: MentionKind; id: string; name: string; chip?: ReactNode }) => (
    <div key={id} className="story-pick">
      <button type="button" className="story-peek" aria-label={`Peek: ${name}`} onClick={() => peek(kind, id)}>
        {name}
      </button>
      {chip}
      <span className="story-leader" aria-hidden="true" />
      <label className="story-entry">
        <input type="checkbox" checked={beat.onEntry.includes(id)} disabled={saving} onChange={() => toggleEntry(id)} />
        <span className="story-entry-box" aria-hidden="true">
          <Check size={12} strokeWidth={3.6} />
        </span>
        ON ENTRY<span className="sr-only"> {name}</span>
      </label>
    </div>
  );

  // A part that has nothing yet still shows, with its pencil, so it can be started from the page.
  const part = ({
    label,
    name,
    section,
    empty,
    children,
  }: {
    label?: string;
    name: string;
    section: BeatSection;
    empty?: string;
    children?: ReactNode;
  }) => (
    <StorySection label={label} name={name} onEdit={() => onEdit(section)}>
      {children || <span className="dim">{empty}</span>}
    </StorySection>
  );

  return (
    <div className="stack">
      <div className="story-flip">
        <button
          className="btn story-arrow"
          aria-label={prev ? `Previous scene: ${prev.title}` : "No previous scene"}
          disabled={!prev}
          onClick={() => prev && onOpen(prev.id)}
        >
          ‹
        </button>
        <div className="story-tabs">
          {adv.beats.map((b, i) => (
            <button
              key={b.id}
              className="story-tab"
              aria-label={`Scene ${sceneNumber(i)}: ${b.title}`}
              aria-current={b.id === beat.id ? "page" : undefined}
              onClick={() => onOpen(b.id)}
            >
              {sceneNumber(i)}
            </button>
          ))}
        </div>
        <button
          className="btn story-arrow"
          aria-label={next ? `Next scene: ${next.title}` : "No next scene"}
          disabled={!next}
          onClick={() => next && onOpen(next.id)}
        >
          ›
        </button>
      </div>

      <div className="story-spread">
        <div className="story-leaf">
          <span className="label accent">
            SCENE {sceneNumber(index)} · {beat.type.toUpperCase()} · {place ? place.name.toUpperCase() : "NO PLACE YET"}
          </span>
          <h2 className="story-title">{beat.title.toUpperCase()}</h2>
          <div className="keys" style={{ padding: 0 }}>
            <span className={`chip ${beat.status === "active" ? "warn" : ""}`}>{beat.status.toUpperCase()}</span>
            <span className={`chip ${fixes.length ? "warn" : ""}`}>{readiness(fixes)}</span>
            {fixes.length > 0 && <span className="dim">{fixes.join(" · ")}</span>}
          </div>
          {part({
            label: "GOAL",
            name: "goal",
            section: "goal",
            empty: "NO GOAL YET",
            children: beat.goal && (
              <b>
                <Mentions text={beat.goal} self={beat.id} />
              </b>
            ),
          })}
          {part({
            label: "READ ALOUD",
            name: "read aloud",
            section: "readAloud",
            empty: "NOTHING TO READ ALOUD YET",
            children: beat.readAloud && (
              <blockquote className="story-read">
                <pre className="text">
                  <Mentions text={beat.readAloud} self={beat.id} />
                </pre>
              </blockquote>
            ),
          })}
          {/* Closed by default so a player glancing at the tablet doesn't read it. */}
          {part({
            name: "GM notes",
            section: "gmNotes",
            children: (
              <details className="field plate">
                <summary className="label">GM NOTES · WHAT&apos;S REALLY GOING ON · TAP TO REVEAL</summary>
                {beat.gmNotes ? (
                  <pre className="text">
                    <Mentions text={beat.gmNotes} self={beat.id} />
                  </pre>
                ) : (
                  <span className="dim">NONE YET</span>
                )}
              </details>
            ),
          })}
          {part({
            label: "OUTCOME",
            name: "outcome",
            section: "outcome",
            empty: "FILL IN AFTER PLAY",
            children: beat.outcome && (
              <pre className="text">
                <Mentions text={beat.outcome} self={beat.id} />
              </pre>
            ),
          })}
        </div>

        <div className="story-leaf">
          {part({
            label: "PLACE",
            name: "place",
            section: "place",
            empty: "NO PLACE YET",
            children: place && entryRow({ kind: "location", id: place.id, name: place.name }),
          })}
          {part({
            label: npcs.length ? `CAST · ${npcs.length}` : "CAST",
            name: "cast",
            section: "cast",
            empty: "NO ONE YET",
            children: npcs.length > 0 && <>{npcs.map((n) => entryRow({ kind: "npc", id: n.id, name: n.name }))}</>,
          })}
          {part({
            label: handouts.length ? `HANDOUTS · ${handouts.length}` : "HANDOUTS",
            name: "handouts",
            section: "cast",
            empty: "NONE YET",
            children: handouts.length > 0 && (
              <>
                {handouts.map((h) => {
                  const only = h.audience.map(agentName).join(", ").toUpperCase();
                  return entryRow({
                    kind: "handout",
                    id: h.id,
                    name: h.title,
                    chip: h.audience.length ? (
                      <ReachChip only={only} />
                    ) : (
                      <span className="chip reach">
                        <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
                        ALL
                      </span>
                    ),
                  });
                })}
              </>
            ),
          })}
          {part({
            label: items.length ? `ITEMS · ${items.length}` : "ITEMS",
            name: "items",
            section: "cast",
            empty: "NONE YET",
            children: items.length > 0 && (
              <>
                {items.map((it) => {
                  const holder = holderOf(it, { codex, characters: state.characters });
                  return (
                    <div key={it.id} className="story-line">
                      <b>{it.name.toUpperCase()}</b>
                      <span className="dim">
                        {holder.label} {holder.name}
                      </span>
                      <ItemGive item={it} characters={state.characters} send={send} onError={onError} />
                    </div>
                  );
                })}
              </>
            ),
          })}
          {part({
            name: "tests",
            section: "tests",
            children:
              beat.tests.length > 0 ? (
                <SceneTests
                  tests={beat.tests}
                  characters={state.characters}
                  agents={state.characters.filter((c) => seated.has(c.id))}
                  send={send}
                  onReport={onReport}
                />
              ) : (
                <>
                  <span className="label">TESTS</span>
                  <span className="dim">NONE YET</span>
                </>
              ),
          })}
          {part({
            name: "Ruin and Glory",
            section: "pools",
            children:
              beat.ruin.length + beat.glory.length + beat.spends.length > 0 ? (
                <ScenePools
                  beat={beat}
                  pools={state.campaign}
                  players={state.characters.length}
                  send={send}
                  onReport={onReport}
                />
              ) : (
                <>
                  <span className="label">RUIN & GLORY</span>
                  <span className="dim">NONE YET</span>
                </>
              ),
          })}
          {place &&
            beat.hazards.length > 0 &&
            part({
              name: "hazards",
              section: "place",
              children: (
                <SceneHazards
                  beat={beat}
                  place={place}
                  tables={presets.hazards}
                  bestiary={bestiary}
                  tier={state.campaign.tier}
                  send={send}
                  onReport={onReport}
                />
              ),
            })}
          {part({
            label: "FIGHT",
            name: "fight",
            section: "fight",
            empty: "NO FIGHT PREPARED",
            children: beat.encounter.length > 0 && (
              <>
                {beat.encounter.map((e, i) => (
                  <div key={i}>{entryLine(e, threatNames)}</div>
                ))}
              </>
            ),
          })}
          {part({
            label: "EXITS",
            name: "exits",
            section: "exits",
            empty: "NO EXITS YET",
            children: beat.exits.length > 0 && (
              <>
                {beat.exits.map((e, i) => {
                  const to = exitNumber(e.beatId, order);
                  const target = adv.beats[order.indexOf(e.beatId ?? "")];
                  return (
                    <div key={i} className="story-line">
                      <i>{e.label}</i>
                      <b className={`story-exit ${to ? "" : "none"}`}>
                        → {to && target ? `${to} · ${target.title.toUpperCase()}` : "NO SCENE YET"}
                      </b>
                    </div>
                  );
                })}
              </>
            ),
          })}
        </div>
      </div>

      <div className="keys story-controls">
        <button className="btn primary" onClick={onRun}>
          {beat.status === "active" ? "▶ BACK TO THIS SCENE" : "▶ RUN THIS SCENE"}
        </button>
        <button className="btn" onClick={() => onEdit()}>
          EDIT
        </button>
        <button className="btn" aria-label={`Move ${beat.title} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="btn" aria-label={`Move ${beat.title} down`} disabled={!next} onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="btn" onClick={() => onStatus("done")}>
          DONE
        </button>
        <button className="btn" onClick={() => onStatus("skipped")}>
          SKIP
        </button>
        {/* Tents for the Agents and every prepared combatant, Threat cards, and the scene's items (#203). */}
        <button
          className="btn"
          onClick={() => print({ agents: fieldedAgentIds(state), encounter: beat.encounter, items: beat.itemIds })}
        >
          PRINT CARDS
        </button>
        {/* The scene's handouts as printed props, one to a page (#204). */}
        {beat.handoutIds.length > 0 && (
          <button className="btn" onClick={() => print({ handouts: beat.handoutIds })}>
            PRINT HANDOUTS
          </button>
        )}
      </div>
    </div>
  );
}
