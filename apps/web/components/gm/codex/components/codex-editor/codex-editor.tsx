"use client";
import Link from "next/link";
import { useState } from "react";

import {
  Attitude,
  CodexInput,
  CodexSave,
  FactionStance,
  HandoutStyle,
  type ActionInput,
  type Character,
  type Codex,
  type FactionKeyword,
  type FightsAs,
  type FlavourTable,
  type HazardTable,
  type LocationHazard,
  type StatSource,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { attitudeLabel } from "@/components/ui/attitude-chip/attitude-chip";
import { FieldError } from "@/components/ui/field-error/field-error";
import { HANDOUT_STYLE_LABEL } from "@/components/ui/handout-doc/constants";
import { HandoutDoc } from "@/components/ui/handout-doc/handout-doc";
import { MentionField } from "@/components/ui/mention-field/mention-field";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";
import { placeOptions } from "@/lib/places/places";

import type { CodexKind } from "../../constants";
import type { Row } from "../../types";
import { FightsAsField } from "../fights-as-field/fights-as-field";
import { HazardList } from "../hazard-list/hazard-list";
import { HolderField } from "../holder-field/holder-field";
import { ImageField } from "../image-field/image-field";
import { KeywordPicker } from "../keyword-picker/keyword-picker";
import { NpcRoller } from "../npc-roller/npc-roller";
import { StatSourceField } from "../stat-source-field/stat-source-field";
import { WargearName } from "../wargear-name/wargear-name";
import { FIELD_TYPES, GM_ONLY_FIELDS, type FieldType } from "./constants";

type Option = [value: string, label: string];
type Field = { key: string; label: string; type: FieldType; options?: Option[] };
type CodexEditorProps = {
  kind: CodexKind;
  codex: Codex;
  characters: Character[];
  send: Send;
  row: Row | null;
  keywords: readonly FactionKeyword[]; // the books' Keywords the faction picker suggests
  bestiary: Threat[];
  tier: number;
  flavour: FlavourTable[]; // the books' name and appearance tables, for an NPC's ROLL NAME and ROLL LOOK (issue #48)
  hazards: HazardTable[]; // the books' hazard tables, for a place's hazard list (issue #49)
  wargear: Wargear[]; // the catalogue an item's NAME searches (issue #51)
  onDone: () => void;
  // In a quick-edit sheet (a peek's EDIT): DONE saves, and the full editor is a link away; the sheet's × cancels.
  sheet?: { codexHref: string };
};

const upperOptions = (values: readonly string[]): Option[] => values.map((v) => [v, v.toUpperCase()]);
const NONE: Option = ["", "—"];
// An NPC's, place's or handout's picture (issue #199), and its own reveal: revealing the entry doesn't show it.
const PICTURE: Field[] = [
  { key: "imageId", label: "PICTURE", type: "image" },
  { key: "imageRevealed", label: "PICTURE SHOWN TO PLAYERS", type: "bool" },
];
const PICTURE_KEYS: ReadonlySet<string> = new Set(PICTURE.map((f) => f.key)); // drawn in the folded PICTURE section
const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function fieldsFor({
  kind,
  codex,
  characters,
  id,
}: {
  kind: CodexKind;
  codex: Codex;
  characters: Character[];
  id?: string; // the entry being edited
}): Field[] {
  switch (kind) {
    case "npc":
      return [
        { key: "name", label: "NAME", type: "text" },
        { key: "role", label: "ROLE", type: "text" },
        {
          key: "factionId",
          label: "FACTION",
          type: "select",
          options: [NONE, ...codex.factions.map((f): Option => [f.id, f.name])],
        },
        {
          key: "attitude",
          label: "ATTITUDE (Core p.168, optional rule)",
          type: "select",
          options: Attitude.options.map((a): Option => [a, attitudeLabel(a)]),
        },
        { key: "fightsAs", label: "FIGHTS AS (players never see this)", type: "fightsAs" },
        { key: "statSource", label: "STAT SOURCE", type: "statSource" },
        { key: "description", label: "DESCRIPTION (players see)", type: "area" },
        { key: "gmNotes", label: "GM NOTES", type: "area" },
        { key: "secrets", label: "SECRETS", type: "area" },
        { key: "revealed", label: "REVEALED TO PLAYERS", type: "bool" },
        ...PICTURE,
      ];
    case "location":
      return [
        { key: "name", label: "NAME", type: "text" },
        {
          key: "parentId",
          label: "INSIDE",
          type: "select",
          options: [NONE, ...placeOptions(codex.locations, id)], // not inside itself (issue #50)
        },
        { key: "description", label: "DESCRIPTION (players see)", type: "area" },
        { key: "hazardList", label: "HAZARDS · GM ONLY", type: "hazardList" },
        { key: "hazards", label: "HAZARDS · YOUR NOTES", type: "area" },
        { key: "gmNotes", label: "GM NOTES", type: "area" },
        { key: "revealed", label: "REVEALED TO PLAYERS", type: "bool" },
        ...PICTURE,
      ];
    case "handout":
      return [
        { key: "title", label: "TITLE", type: "text" },
        // How it looks as a prop, on the phone and on paper (issue #204); PLAIN is the look every older one has.
        {
          key: "style",
          label: "STYLE",
          type: "select",
          options: HandoutStyle.options.map((v): Option => [v, HANDOUT_STYLE_LABEL[v]]),
        },
        { key: "header", label: "HEADER (EMPTY: THE STYLE'S OWN)", type: "text" },
        { key: "body", label: "TEXT", type: "area" },
        { key: "revealed", label: "SENT TO PLAYERS", type: "bool" },
        {
          key: "audience",
          label: "REVEAL TO",
          type: "picks",
          options: characters.map((c): Option => [c.id, c.name]),
        },
        ...PICTURE,
      ];
    case "faction":
      return [
        { key: "name", label: "NAME", type: "text" },
        { key: "keywords", label: "KEYWORDS (Core pp.375–378)", type: "keywords" },
        { key: "stance", label: "STANCE", type: "select", options: upperOptions(FactionStance.options) },
        { key: "notes", label: "NOTES", type: "area" },
        { key: "secrets", label: "SECRETS", type: "area" },
      ];
    case "item":
      return [
        { key: "name", label: "NAME (SEARCHES THE WARGEAR CATALOGUE)", type: "wargearName" },
        { key: "description", label: "DESCRIPTION (WHAT YOU READ OUT WHEN THE AGENTS FIND IT)", type: "area" },
        { key: "gmNotes", label: "GM NOTES", type: "area" },
        { key: "locationId", label: "HOLDER", type: "holder" },
      ];
  }
}

// A new entry's select starts at the schema's default (a Neutral Attitude, a neutral stance), else its first option:
// players see an NPC's Attitude (rules-flow §11.89), so it mustn't start Hostile just by coming first.
function selectStart(kind: CodexKind, f: Field) {
  const shape: Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }> =
    CodexInput[kind].shape;
  const d = shape[f.key]?.safeParse(undefined);
  return d?.success && typeof d.data === "string" ? d.data : (f.options?.[0]?.[0] ?? "");
}

export function CodexEditor({
  kind,
  codex,
  characters,
  send,
  row,
  keywords,
  bestiary,
  tier,
  flavour,
  hazards,
  wargear,
  onDone,
  sheet,
}: CodexEditorProps) {
  const fields = fieldsFor({ kind, codex, characters, id: row?.id });
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    // Start from the whole row, so fields with no input here survive a save; zod strips the rest.
    const init: Record<string, unknown> = { ...row };
    for (const f of fields)
      init[f.key] = row?.[f.key] ?? (f.type === "select" ? selectStart(kind, f) : FIELD_TYPES[f.type].empty);
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useFieldErrors("f-"); // each field's input is f-<key>
  const [armed, setArmed] = useState<number | null>(null); // DELETE's first tap, at that many places inside

  const setField = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value })); // functional: an upload may land after other edits
    fieldErrors.clear(key);
  };

  // ROLL LOOK: the rolled line goes under what DESCRIPTION already says (rules-flow §11.91).
  const appendLook = (line: string) => {
    const d = String(draft.description ?? "").trimEnd();
    setField("description", d ? `${d}\n${line}` : line);
  };

  // SAVE: empty id selects become null (no faction / no parent), then create or update.
  const save = async () => {
    setError(null);
    const data: Record<string, unknown> = { ...draft };
    for (const f of fields) if (f.type === "select" && data[f.key] === "" && f.key.endsWith("Id")) data[f.key] = null;
    // CodexSave first: a nameless entry can't be listed or picked, so NAME (or TITLE) is marked on the field.
    if (!fieldErrors.check<unknown>(CodexSave[kind], data)) return;
    const r = await send({ type: "codex.save", kind, ...(row ? { id: row.id } : {}), data } as ActionInput);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // DELETE: removes the entry, then closes the editor; a refusal stays open with the reason. A place with places inside
  // asks a second tap first: they become top-level (§11.96).
  const inside = kind === "location" && row ? codex.locations.filter((l) => l.parentId === row.id).length : 0;
  const handleDelete = async () => {
    if (!row) return;
    // The count may change while the editor is open (another tablet); a new count asks again.
    if (inside && armed !== inside) return setArmed(inside);
    const r = await send({ type: "codex.delete", kind, id: row.id });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // One field of the form: its label, its input, and the reason a refused SAVE gives for it.
  const fieldRow = (f: Field) => (
    <div key={f.key} className={GM_ONLY_FIELDS.has(f.key) ? "field plate" : "field"}>
      {f.type === "picks" ? (
        // None picked means every player (toPlayerCodex); say so, since an empty group reads as "nobody".
        <span className="label" id={`f-${f.key}`}>
          {f.label}: {(draft[f.key] as string[]).length ? "SELECTED AGENTS ONLY" : "EVERYONE"}
        </span>
      ) : f.type === "statSource" ||
        f.type === "fightsAs" ||
        f.type === "hazardList" ||
        f.type === "holder" ||
        f.type === "image" ? (
        <span className="label" id={`f-${f.key}`}>
          {f.label}
        </span>
      ) : (
        <label className="label" htmlFor={`f-${f.key}`}>
          {f.label}
        </label>
      )}
      {f.type === "text" && (
        <input
          id={`f-${f.key}`}
          {...fieldErrors.marks(f.key)}
          className="input"
          value={String(draft[f.key] ?? "")}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      )}
      {f.type === "area" && (
        <MentionField
          id={`f-${f.key}`}
          {...fieldErrors.marks(f.key)}
          multiline
          value={String(draft[f.key] ?? "")}
          onChange={(v) => setField(f.key, v)}
        />
      )}
      {f.type === "keywords" && (
        <KeywordPicker
          id={`f-${f.key}`}
          value={draft[f.key] as string[]}
          suggestions={keywords}
          onChange={(v) => setField(f.key, v)}
        />
      )}
      {f.type === "fightsAs" && (
        <FightsAsField id={`f-${f.key}`} value={draft[f.key] as FightsAs} onChange={(v) => setField(f.key, v)} />
      )}
      {f.type === "statSource" && (
        <StatSourceField
          id={`f-${f.key}`}
          value={draft[f.key] as StatSource}
          bestiary={bestiary}
          tier={tier}
          onChange={(v) => setField(f.key, v)}
        />
      )}
      {f.type === "hazardList" && (
        <HazardList
          id={`f-${f.key}`}
          value={draft[f.key] as LocationHazard[]}
          tables={hazards}
          bestiary={bestiary}
          tier={tier}
          onChange={(v) => setField(f.key, v)}
        />
      )}
      {f.type === "wargearName" && (
        <WargearName
          id={`f-${f.key}`}
          marks={fieldErrors.marks("name")}
          name={String(draft.name ?? "")}
          wargearId={(draft.wargearId as string | null | undefined) ?? null}
          catalogue={wargear}
          onChange={(v) => setDraft({ ...draft, ...v })}
        />
      )}
      {f.type === "holder" && (
        <HolderField
          id={`f-${f.key}`}
          locationId={(draft.locationId as string | null | undefined) ?? null}
          npcId={(draft.npcId as string | null | undefined) ?? null}
          codex={codex}
          onChange={(v) => setDraft({ ...draft, ...v })}
        />
      )}
      {f.type === "image" && (
        <ImageField
          id={`f-${f.key}`}
          value={(draft[f.key] as string | null | undefined) ?? null}
          alt={String(draft.name ?? draft.title ?? "")}
          onChange={(v) => setField(f.key, v)}
          onError={setError}
        />
      )}
      {f.type === "bool" && (
        <input
          id={`f-${f.key}`}
          type="checkbox"
          className="check-box"
          checked={Boolean(draft[f.key])}
          onChange={(e) => setField(f.key, e.target.checked)}
        />
      )}
      {f.type === "picks" && (
        <div className="keys" role="group" aria-labelledby={`f-${f.key}`} style={{ paddingTop: 0 }}>
          {f.options?.map(([v, l]) => {
            const picked = (draft[f.key] as string[]).includes(v);
            return (
              <button
                key={v}
                className={`btn sm ${picked ? "primary" : ""}`}
                aria-pressed={picked}
                onClick={() => setField(f.key, toggled(draft[f.key] as string[], v))}
              >
                {l}
              </button>
            );
          })}
          {!f.options?.length && <span className="dim">Add Agents in PARTY.</span>}
        </div>
      )}
      {f.type === "select" && (
        <select
          id={`f-${f.key}`}
          {...fieldErrors.marks(f.key)}
          className="input"
          value={String(draft[f.key] ?? "")}
          onChange={(e) => setField(f.key, e.target.value)}
        >
          {f.options?.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
      <FieldError {...fieldErrors.reason(f.key)} />
    </div>
  );

  return (
    <div className="panel pad stack">
      {kind === "npc" && flavour.length > 0 && (
        <div className="field">
          <span className="label" id="f-roll">
            ROLL A NAME OR A LOOK (Core pp.27–33)
          </span>
          <NpcRoller id="f-roll" tables={flavour} onName={(name) => setField("name", name)} onLook={appendLook} />
        </div>
      )}
      {fields.filter((f) => !PICTURE_KEYS.has(f.key)).map(fieldRow)}
      {/* Optional, so folded away at the end: open from the start when the entry has one, and a REMOVE doesn't snap it shut (issue #199). */}
      {fields.some((f) => PICTURE_KEYS.has(f.key)) && (
        <details className="field" open={Boolean(row?.imageId)}>
          <summary className="label">PICTURE (OPTIONAL)</summary>
          {fields.filter((f) => PICTURE_KEYS.has(f.key)).map(fieldRow)}
        </details>
      )}
      {kind === "item" && (
        <div className="field">
          <span className="label">GIVEN TO</span>
          <span>
            {characters.find((c) => c.id === row?.givenTo)?.name ?? "Nobody yet"}{" "}
            <span className="dim">· set by GIVE TO, not here</span>
          </span>
        </div>
      )}
      {kind === "item" && Array.isArray(draft.mods) && draft.mods.length > 0 && (
        <div className="field plate">
          <span className="label">POWERS (rules-flow.md §11.116)</span>
          <span>{(draft.mods as { kind: string; what?: string }[]).map((m) => m.what ?? m.kind).join(" · ")}</span>
        </div>
      )}
      {kind === "handout" && (
        // What the players will get, as they'll see it (issue #204).
        <div className="field">
          <span className="label">PREVIEW</span>
          <HandoutDoc
            handout={{
              id: row?.id,
              body: String(draft.body ?? ""),
              style: HandoutStyle.catch("plain").parse(draft.style),
              header: String(draft.header ?? ""),
              title: String(draft.title ?? ""),
              imageId: (draft.imageId as string | null | undefined) ?? null,
              imageRevealed: Boolean(draft.imageRevealed),
            }}
          />
        </div>
      )}
      {/* A refusal on something with no field of its own (an item's Powers) still says what. */}
      {(error ?? fieldErrors.elsewhere(fields.map((f) => f.key))) && (
        <div className="red">! {error ?? fieldErrors.elsewhere(fields.map((f) => f.key))}</div>
      )}
      {sheet ? (
        <div className="keys sheet-foot">
          <button className="btn primary" onClick={save}>
            DONE
          </button>
          <Link className="lnk" href={sheet.codexHref}>
            OPEN IN CODEX
          </Link>
        </div>
      ) : (
        <div className="keys">
          <button className="btn primary" onClick={save}>
            SAVE
          </button>
          <button className="btn" onClick={onDone}>
            CANCEL
          </button>
          {row && (
            <button className="btn danger" onClick={handleDelete}>
              {inside && armed === inside ? `DELETE · ${inside} INSIDE GO TOP-LEVEL` : "DELETE"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
