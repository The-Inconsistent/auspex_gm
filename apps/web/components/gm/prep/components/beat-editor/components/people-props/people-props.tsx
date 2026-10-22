"use client";
import { Eye, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ActionInput, Codex, HazardTable, MentionKind } from "@wg/shared";

import { useGm } from "@/components/gm/gm-app/gm-context";
import { FindField } from "@/components/ui/find-field/find-field";
import { useMentions } from "@/components/ui/mentions/mentions-provider";
import type { Send } from "@/hooks/use-table/use-table";
import { hazardView } from "@/lib/hazards/hazards";
import { placeOptions } from "@/lib/places/places";

import type { Draft } from "../../beat-editor";

type PeoplePropsProps = {
  draft: Draft;
  codex: Codex;
  send: Send;
  hazardTables: HazardTable[]; // to name the place's book hazards (issue #49)
  tier: number;
  onChange: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;
};

type ListKey = "npcIds" | "handoutIds" | "itemIds";
type Row = { id: string; name: string; chip?: ReactNode };

// PLACE, NPCS, HANDOUTS and ITEMS as lists with one find-or-name field each (canvas Flow-EditorPeople): a name opens
// its quick-edit sheet, ON ENTRY ticks what reaches the phones when the scene begins, and × takes it out of the scene.
export function PeopleProps({ draft, codex, send, hazardTables, tier, onChange }: PeoplePropsProps) {
  const { state } = useGm();
  const { edit } = useMentions();
  const [errors, setErrors] = useState<Partial<Record<MentionKind, string>>>({});

  const place = codex.locations.find((l) => l.id === draft.locationId);
  const agentName = (id: string) => state.characters.find((c) => c.id === id)?.name ?? "an Agent";
  const toggleEntry = (id: string) =>
    onChange({ onEntry: draft.onEntry.includes(id) ? draft.onEntry.filter((x) => x !== id) : [...draft.onEntry, id] });
  const toggleHazard = (id: string) =>
    onChange({
      hazards: draft.hazards.some((x) => x.id === id)
        ? draft.hazards.filter((x) => x.id !== id)
        : [...draft.hazards, { id, spotted: false }],
    });

  // PLACE is one: a new pick replaces the old, whose ON ENTRY tick and hazard picks go with it.
  const setPlace = (id: string | null) =>
    onChange({
      locationId: id,
      hazards: [],
      onEntry: draft.onEntry.filter((x) => x !== draft.locationId),
    });
  // From the latest draft, since a + NEW lands a moment after the tap.
  const addTo = (key: ListKey, id: string) => onChange((d) => ({ [key]: [...d[key], id] }));
  const takeOut = (key: ListKey, id: string) =>
    onChange({ [key]: draft[key].filter((x) => x !== id), onEntry: draft.onEntry.filter((x) => x !== id) });

  // + NEW …: saves a bare codex entry, adds it to the scene and opens its sheet to fill in the rest.
  const create = async (kind: MentionKind, typed: string, add: (id: string) => void) => {
    const r = await send({
      type: "codex.save",
      kind,
      data: kind === "handout" ? { title: typed } : { name: typed },
    } as ActionInput);
    setErrors((e) => ({ ...e, [kind]: r.ok ? undefined : r.error }));
    if (!r.ok || !r.id) return;
    add(r.id);
    edit?.(kind, r.id);
  };

  const pickRow = ({
    kind,
    row,
    ticked,
    onRemove,
  }: {
    kind: MentionKind;
    row: Row;
    ticked?: boolean; // absent: no ON ENTRY (an item is found, not shown)
    onRemove: () => void;
  }) => (
    <div key={row.id} className="ed-pick">
      <button type="button" className="ed-name" onClick={() => edit?.(kind, row.id)}>
        {row.name}
      </button>
      {row.chip}
      <span className="leader" aria-hidden="true" />
      {ticked !== undefined && (
        <label className="story-entry">
          <input type="checkbox" checked={ticked} onChange={() => toggleEntry(row.id)} />
          <span className="story-entry-box" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          ON ENTRY<span className="sr-only"> {row.name}</span>
        </label>
      )}
      <button type="button" className="btn sm" aria-label={`Take ${row.name} out of this scene`} onClick={onRemove}>
        ×
      </button>
    </div>
  );

  const list = ({
    kind,
    label,
    rows,
    ticked,
    key,
    options,
    noun,
    children,
  }: {
    kind: Exclude<MentionKind, "location">;
    label: string;
    rows: Row[];
    ticked: boolean;
    key: ListKey;
    options: { id: string; name: string; detail?: string }[];
    noun: string;
    children?: ReactNode;
  }) => (
    <div className="field">
      <span className="label">
        {label} · {rows.length}
      </span>
      {rows.map((row) =>
        pickRow({
          kind,
          row,
          ticked: ticked ? draft.onEntry.includes(row.id) : undefined,
          onRemove: () => takeOut(key, row.id),
        }),
      )}
      <FindField
        label={`Find or name ${noun}`}
        options={options.filter((o) => !draft[key].includes(o.id))}
        onPick={(id) => addTo(key, id)}
        newLabel={(t) => `+ NEW ${kind.toUpperCase()} “${t}”`}
        onCreate={(t) => create(kind, t, (id) => addTo(key, id))}
      />
      {errors[kind] && <span className="red">! {errors[kind]}</span>}
      {children}
    </div>
  );

  const placeLabels = placeOptions(codex.locations);

  return (
    <div className="stack">
      <div className="ed-people">
        <div className="field">
          <span className="label">PLACE · {place ? 1 : 0}</span>
          {place &&
            pickRow({
              kind: "location",
              row: { id: place.id, name: place.name },
              ticked: draft.onEntry.includes(place.id),
              onRemove: () => setPlace(null),
            })}
          <FindField
            label="Find or name a place"
            options={placeLabels
              .filter(([id]) => id !== draft.locationId)
              .map(([id, name]) => ({
                id,
                name: name.trim(),
                detail: name.startsWith(" ") ? "INSIDE ANOTHER PLACE" : undefined,
              }))}
            onPick={setPlace}
            newLabel={(t) => `+ NEW PLACE “${t}”`}
            onCreate={(t) => create("location", t, setPlace)}
          />
          {errors.location && <span className="red">! {errors.location}</span>}
          {place && place.hazardList.length > 0 && (
            <div className="plate stack">
              <span className="label">HAZARDS AT THIS PLACE · PICK WHAT APPLIES</span>
              <div className="keys" role="group" aria-label="Hazards in this scene">
                {place.hazardList.map((h) => {
                  const on = draft.hazards.some((x) => x.id === h.id);
                  const name = hazardView({ entry: h, tables: hazardTables, tier })?.name ?? "Unknown hazard";
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className={`btn sm ${on ? "primary" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleHazard(h.id)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {list({
          kind: "npc",
          label: "NPCS",
          key: "npcIds",
          noun: "an NPC",
          ticked: true,
          rows: codex.npcs.filter((n) => draft.npcIds.includes(n.id)).map((n) => ({ id: n.id, name: n.name })),
          options: codex.npcs.map((n) => ({ id: n.id, name: n.name })),
        })}
      </div>
      {list({
        kind: "handout",
        label: "HANDOUTS",
        key: "handoutIds",
        noun: "a handout",
        ticked: true,
        rows: codex.handouts
          .filter((h) => draft.handoutIds.includes(h.id))
          .map((h) => {
            const only = h.audience.map(agentName).join(", ").toUpperCase();
            return {
              id: h.id,
              name: h.title,
              chip: h.audience.length ? (
                <span className="chip warn reach" title={`${only} only`}>
                  <Lock size={12} strokeWidth={2.4} aria-hidden="true" />
                  <span className="reach-names">{only}</span>&nbsp;ONLY
                </span>
              ) : (
                <span className="chip reach">
                  <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
                  ALL
                </span>
              ),
            };
          }),
        options: codex.handouts.map((h) => ({ id: h.id, name: h.title, detail: `HANDOUT · ${h.style.toUpperCase()}` })),
      })}
      {list({
        kind: "item",
        label: "ITEMS",
        key: "itemIds",
        noun: "an item",
        ticked: false,
        rows: codex.items.filter((it) => draft.itemIds.includes(it.id)).map((it) => ({ id: it.id, name: it.name })),
        options: codex.items.map((it) => ({ id: it.id, name: it.name })),
        children: (
          <span className="dim">
            <i>What the Agents can find in this scene. Hand one over with GIVE on the scene, in SCENE or STORY.</i>
          </span>
        ),
      })}
      <span className="dim">
        <i>Ticked ON ENTRY reach the phones when the scene begins.</i>
      </span>
    </div>
  );
}
