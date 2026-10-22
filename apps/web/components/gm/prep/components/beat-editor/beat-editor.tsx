"use client";
import { useEffect, useRef, useState } from "react";

import {
  BeatType,
  CodexSave,
  parseMentions,
  type BeatExit,
  type BeatStatus,
  type BeatTest,
  type Codex,
  type HazardTable,
  type MentionKind,
  type PoolPresetTable,
  type SkillDn,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { MentionField } from "@/components/ui/mention-field/mention-field";
import { useMentions } from "@/components/ui/mentions/mentions-provider";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import type { Beat, EncounterEntry, PoolDrafts } from "../../types";
import { savedPools, stripBeat } from "../../utils";
import { Exits } from "./components/exits/exits";
import { FightEntries } from "./components/fight-entries/fight-entries";
import { PeopleProps } from "./components/people-props/people-props";
import { RuinGlory } from "./components/ruin-glory/ruin-glory";
import { Tests } from "./components/tests/tests";
import {
  BEAT_TEXT_FIELDS,
  EDITOR_GROUPS,
  SECTION_GROUP,
  type BeatSection,
  type BeatTextField,
  type EditorGroup,
} from "./constants";

type BeatEditorProps = {
  adventureId: string;
  beat: Beat | null;
  codex: Codex;
  agents: number; // the Agents a fight would add, which is who the budget is sized for
  tier: number;
  send: Send;
  bestiary: Threat[];
  skillDns: SkillDn[];
  poolTables: PoolPresetTable[];
  hazardTables: HazardTable[]; // to name the place's book hazards (issue #49)
  wargear: Wargear[]; // + NEW CUSTOM THREAT's weapons, as CODEX › THREATS has them
  onDone: () => void;
  section?: BeatSection; // STORY's pencil: the part the editor opens scrolled to
};

// The beat as the editor holds it: a Ruin or Glory amount, or a spend's cost, may be empty until the GM sets it.
export type Draft = Omit<ReturnType<typeof stripBeat>, keyof PoolDrafts> & PoolDrafts;

// A codex entry a scene can hold, by the list that holds it (a place is the one locationId).
const HELD: Partial<Record<MentionKind, "npcIds" | "handoutIds" | "itemIds">> = {
  npc: "npcIds",
  handout: "handoutIds",
  item: "itemIds",
};

const blank = (adventureId: string): Draft => ({
  adventureId,
  title: "",
  goal: "",
  type: "social" as BeatType,
  status: "planned" as BeatStatus,
  readAloud: "",
  gmNotes: "",
  outcome: "",
  locationId: null,
  npcIds: [],
  handoutIds: [],
  itemIds: [],
  encounter: [] as EncounterEntry[],
  exits: [] as BeatExit[],
  tests: [] as BeatTest[],
  ruin: [],
  glory: [],
  spends: [],
  hazards: [],
  onEntry: [],
});

// The scene editor (canvas Flow-Editor*): one page you scroll, a strip that jumps between its parts, and one save bar.
// A STORY pencil opens it scrolled to its part. Lists of codex entries find or name them in place, and a name opens
// its quick-edit sheet; Tests, spends and fight entries are rows that open one at a time.
export function BeatEditor({
  adventureId,
  beat,
  codex,
  agents,
  tier,
  send,
  bestiary,
  skillDns,
  poolTables,
  hazardTables,
  wargear,
  onDone,
  section,
}: BeatEditorProps) {
  const [initial] = useState<Draft>(() => (beat ? stripBeat(beat) : blank(adventureId)));
  const [b, setB] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false); // a custom threat is being written: its CREATE adds to this fight
  const fieldErrors = useFieldErrors("b-"); // each text field's input is b-<key>
  const { link } = useMentions();
  const scenes = codex.adventures.find((a) => a.id === adventureId)?.beats ?? [];
  // Functional either way: a codex save (a + NEW in a list) may land after other edits, which it must not undo.
  const patch = (p: Partial<Draft> | ((d: Draft) => Partial<Draft>)) =>
    setB((d) => ({ ...d, ...(typeof p === "function" ? p(d) : p) }));

  // The strip follows the part on screen; a pencil's part is where the editor opens.
  const [group, setGroup] = useState<EditorGroup>(section ? SECTION_GROUP[section] : "story");
  // A strip tap marks its part at once; the scroll it starts mustn't mark the parts it passes (or, at the page's end,
  // the part above one too short to reach the top).
  const tapped = useRef(0);
  // External system: the DOM. Scrolls once to the pencil's part, then watches which part is on screen.
  useEffect(() => {
    if (section) {
      const text = section in BEAT_TEXT_FIELDS;
      document
        .getElementById(text ? `b-${section}` : `ed-${SECTION_GROUP[section]}`)
        ?.scrollIntoView({ block: "start" });
    }
    // The part on screen is the last one whose heading has passed under the strip.
    const follow = () => {
      if (Date.now() - tapped.current < 1000) return;
      const line = (document.querySelector(".ed-strip")?.getBoundingClientRect().bottom ?? 0) + 8;
      const passed = EDITOR_GROUPS.filter(
        (g) => (document.getElementById(`ed-${g.id}`)?.getBoundingClientRect().top ?? Infinity) <= line,
      );
      setGroup(passed.at(-1)?.id ?? "story");
    };
    // Capture: the scroll happens in the GM body, and a scroll event doesn't bubble.
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", follow, { capture: true });
  }, [section]);

  // What the strip counts per part.
  const counts: Record<EditorGroup, number | null> = {
    story: null,
    people: (b.locationId ? 1 : 0) + b.npcIds.length + b.handoutIds.length + b.itemIds.length,
    tests: b.tests.length,
    pools: b.ruin.length + b.glory.length + b.spends.length,
    fight: b.encounter.reduce((n, e) => n + e.count, 0),
    exits: b.exits.length,
  };

  // How many of the scene's fields differ from what it was opened with.
  const changed = (Object.keys(b) as (keyof Draft)[]).filter(
    (k) => JSON.stringify(b[k]) !== JSON.stringify(initial[k]),
  ).length;
  // A Ruin or Glory line with no amount, or a spend with no cost, holds the save: the app never invents one (§11.78).
  const unset =
    [...b.ruin, ...b.glory].filter((l) => l.text.trim() && l.amount === null).length +
    b.spends.filter((s) => s.name.trim() && s.cost === null).length;

  // Named in the scene's text but not in it: one tap puts them all in (a place only when the scene has none).
  const named = [b.goal, b.readAloud, b.gmNotes]
    .flatMap((text) =>
      parseMentions(text).flatMap((part) =>
        "kind" in part ? [part] : link({ text: part.text }).filter((p) => "kind" in p),
      ),
    )
    .filter((m): m is { kind: MentionKind; id: string } => "kind" in m)
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .filter((m) => {
      const list = HELD[m.kind];
      return list ? !b[list].includes(m.id) : m.kind === "location" && !b.locationId;
    })
    .slice(0, 6);
  const nameOf = (kind: MentionKind, id: string) => {
    const list =
      kind === "npc" ? codex.npcs : kind === "location" ? codex.locations : kind === "item" ? codex.items : [];
    return kind === "handout" ? codex.handouts.find((h) => h.id === id)?.title : list.find((e) => e.id === id)?.name;
  };
  const addNamed = () =>
    setB((d) => {
      const next = { ...d };
      for (const m of named) {
        const list = HELD[m.kind];
        if (list) next[list] = [...next[list], m.id];
        else if (m.kind === "location" && !next.locationId) next.locationId = m.id;
      }
      return next;
    });

  // EXITS' → NEW SCENE: a scene by that title, saved now in this adventure, so the exit can point at it.
  const newScene = async (title: string) => {
    const r = await send({ type: "codex.save", kind: "beat", data: { adventureId, title } });
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    return r.id ?? null;
  };

  // SAVE SCENE: creates or updates the beat, then closes the editor. Blank exits, Shifts and Ruin and Glory lines go,
  // and an exit target deleted while the editor was open (its select shows —) is dropped rather than refused.
  const save = async () => {
    setError(null);
    const pools = savedPools(b);
    if (!pools) return setError("Set the amount of every Ruin and Glory line, and the cost of every spend");
    const exits = b.exits
      .map((e) => ({ ...e, beatId: scenes.some((s) => s.id === e.beatId) ? e.beatId : null }))
      .filter((e) => e.label.trim() || e.beatId);
    const tests = b.tests.map((t) => ({ ...t, shifts: t.shifts.filter((s) => s.trim()) }));
    // The editor has no status field: send the scene's live one, not the draft's (a begin may have landed meanwhile).
    const data = { ...b, status: beat?.status ?? b.status, exits, tests, ...pools };
    // CodexSave first: a nameless scene can't be listed or picked, so TITLE is marked on the field.
    if (!fieldErrors.check(CodexSave.beat, data)) return document.getElementById("b-title")?.focus();
    const r = await send({ type: "codex.save", kind: "beat", ...(beat ? { id: beat.id } : {}), data });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // DELETE SCENE: removes the beat, then closes the editor; a refusal stays open with the reason.
  const handleDelete = async () => {
    if (!beat) return;
    const r = await send({ type: "codex.delete", kind: "beat", id: beat.id });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  const textField = (key: BeatTextField) => {
    const { label, area, hint } = BEAT_TEXT_FIELDS[key];
    return (
      <div className="field">
        <label className="label" htmlFor={`b-${key}`}>
          {label}
        </label>
        {/* Every scene text but its title can mention a codex entry (issue #200). */}
        {key === "title" ? (
          <input
            id={`b-${key}`}
            {...fieldErrors.marks(key)}
            className="input"
            value={b[key]}
            onChange={(e) => patch({ [key]: e.target.value })}
          />
        ) : (
          <MentionField
            id={`b-${key}`}
            {...fieldErrors.marks(key)}
            multiline={area}
            value={b[key]}
            onChange={(v) => patch({ [key]: v })}
          />
        )}
        <FieldError {...fieldErrors.reason(key)} />
        {hint && (
          <div className="dim" style={{ fontSize: 12 }}>
            {hint}
          </div>
        )}
      </div>
    );
  };

  const fault = error ?? fieldErrors.elsewhere(Object.keys(BEAT_TEXT_FIELDS));
  const state = drafting
    ? "FINISH OR CANCEL THE CUSTOM THREAT TO SAVE"
    : unset
      ? `SET ${unset} ${unset === 1 ? "AMOUNT OR COST" : "AMOUNTS OR COSTS"} TO SAVE`
      : changed
        ? `${changed} UNSAVED ${changed === 1 ? "CHANGE" : "CHANGES"}`
        : "NO CHANGES";

  return (
    <>
      <nav className="ed-strip" aria-label="Parts of this scene">
        {EDITOR_GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#ed-${g.id}`}
            aria-current={group === g.id ? "true" : undefined}
            onClick={() => {
              tapped.current = Date.now();
              setGroup(g.id);
            }}
          >
            {g.label}
            {counts[g.id] !== null && <span>{counts[g.id]}</span>}
          </a>
        ))}
      </nav>

      <div className="ed">
        <section id="ed-story" className="ed-sec" aria-labelledby="ed-story-h">
          <div className="rule" id="ed-story-h">
            STORY
          </div>
          <div className="ed-pair">
            {textField("title")}
            <div className="field">
              <label className="label" htmlFor="b-type">
                TYPE
              </label>
              <select
                id="b-type"
                className="input"
                value={b.type}
                onChange={(e) => patch({ type: BeatType.parse(e.target.value) })}
              >
                {BeatType.options.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {textField("goal")}
          {textField("readAloud")}
          <div className="plate stack">{textField("gmNotes")}</div>
          {named.length > 0 && (
            <div className="ed-named">
              Named here, not in the scene:{" "}
              {named.map((m, i) => (
                <b key={m.id}>
                  {i > 0 && "· "}
                  {nameOf(m.kind, m.id)}
                </b>
              ))}
              <button className="btn sm" onClick={addNamed}>
                + ADD {named.length === 1 ? "" : named.length === 2 ? "BOTH" : `ALL ${named.length}`}
              </button>
            </div>
          )}
          {textField("outcome")}
        </section>

        <section id="ed-people" className="ed-sec" aria-labelledby="ed-people-h">
          <div className="rule" id="ed-people-h">
            PEOPLE & PROPS
          </div>
          <PeopleProps draft={b} codex={codex} send={send} hazardTables={hazardTables} tier={tier} onChange={patch} />
        </section>

        <section id="ed-tests" className="ed-sec" aria-labelledby="ed-tests-h">
          <div className="rule" id="ed-tests-h">
            TESTS · {b.tests.length}
          </div>
          <Tests tests={b.tests} skillDns={skillDns} onChange={(tests) => patch({ tests })} />
        </section>

        <section id="ed-pools" className="ed-sec" aria-labelledby="ed-pools-h">
          <div className="rule" id="ed-pools-h">
            RUIN & GLORY
          </div>
          <RuinGlory lines={b} tables={poolTables} onChange={(lines) => patch(lines)} />
        </section>

        <section id="ed-fight" className="ed-sec" aria-labelledby="ed-fight-h">
          <div className="rule" id="ed-fight-h">
            FIGHT IF IT BREAKS OUT
          </div>
          <FightEntries
            entries={b.encounter}
            agents={agents}
            tier={tier}
            bestiary={bestiary}
            wargear={wargear}
            poolTables={poolTables}
            send={send}
            onChange={(encounter) => patch({ encounter })}
            onDrafting={setDrafting}
          />
        </section>

        <section id="ed-exits" className="ed-sec" aria-labelledby="ed-exits-h">
          <div className="rule" id="ed-exits-h">
            EXITS
          </div>
          <Exits
            exits={b.exits}
            scenes={scenes}
            current={beat?.id}
            onChange={(exits) => patch({ exits })}
            onNewScene={newScene}
          />
          {beat && (
            <div>
              <button className="lnk red" onClick={handleDelete}>
                DELETE SCENE
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="ed-bar">
        <span className={`ed-state ${fault || unset || drafting || changed ? "red" : ""}`} role="status">
          {fault ? `! ${fault}` : state}
        </span>
        <button className="btn" onClick={onDone}>
          CANCEL
        </button>
        {/* Not while a custom threat is open: its CREATE adds to this fight, so the scene waits for it or CANCEL. */}
        <button className="btn primary" disabled={drafting || unset > 0} onClick={save}>
          SAVE SCENE
        </button>
      </div>
    </>
  );
}
