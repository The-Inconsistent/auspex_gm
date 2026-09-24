"use client";
import { useState } from "react";

import { Attitude, FactionStance, type ActionInput, type Codex } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import type { CodexKind } from "../../constants";
import type { Row } from "../../types";
import { FIELD_TYPES, type FieldType } from "./constants";

type Option = [value: string, label: string];
type Field = { key: string; label: string; type: FieldType; options?: Option[] };
type CodexEditorProps = { kind: CodexKind; codex: Codex; send: Send; row: Row | null; onDone: () => void };

const upperOptions = (values: readonly string[]): Option[] => values.map((v) => [v, v.toUpperCase()]);
const NONE: Option = ["", "—"];

function fieldsFor(kind: CodexKind, codex: Codex): Field[] {
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
        { key: "attitude", label: "ATTITUDE (p.168)", type: "select", options: upperOptions(Attitude.options) },
        { key: "description", label: "DESCRIPTION (players see)", type: "area" },
        { key: "gmNotes", label: "GM NOTES", type: "area" },
        { key: "secrets", label: "SECRETS", type: "area" },
        { key: "revealed", label: "REVEALED TO PLAYERS", type: "bool" },
      ];
    case "location":
      return [
        { key: "name", label: "NAME", type: "text" },
        {
          key: "parentId",
          label: "INSIDE",
          type: "select",
          options: [NONE, ...codex.locations.map((l): Option => [l.id, l.name])],
        },
        { key: "description", label: "DESCRIPTION (players see)", type: "area" },
        { key: "hazards", label: "HAZARDS (Battlezone tables, TA p.9–21)", type: "area" },
        { key: "gmNotes", label: "GM NOTES", type: "area" },
        { key: "revealed", label: "REVEALED TO PLAYERS", type: "bool" },
      ];
    case "handout":
      return [
        { key: "title", label: "TITLE", type: "text" },
        { key: "body", label: "TEXT", type: "area" },
        { key: "revealed", label: "SENT TO PLAYERS", type: "bool" },
      ];
    case "faction":
      return [
        { key: "name", label: "NAME", type: "text" },
        { key: "keywords", label: "KEYWORDS (comma separated)", type: "list" },
        { key: "stance", label: "STANCE", type: "select", options: upperOptions(FactionStance.options) },
        { key: "notes", label: "NOTES", type: "area" },
        { key: "secrets", label: "SECRETS", type: "area" },
      ];
  }
}

export function CodexEditor({ kind, codex, send, row, onDone }: CodexEditorProps) {
  const fields = fieldsFor(kind, codex);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    // Start from the whole row, so fields with no input here (an NPC's statSource) survive a save; zod strips the rest.
    const init: Record<string, unknown> = { ...row };
    for (const f of fields)
      init[f.key] = row?.[f.key] ?? (f.type === "select" ? (f.options?.[0]?.[0] ?? "") : FIELD_TYPES[f.type].empty);
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, value: unknown) => setDraft({ ...draft, [key]: value });

  // Comma-separated list input: stored as trimmed, non-empty entries.
  const setListField = ({ key, text }: { key: string; text: string }) =>
    setField(
      key,
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

  // SAVE: empty id selects become null (no faction / no parent), then create or update.
  const save = async () => {
    const data: Record<string, unknown> = { ...draft };
    for (const f of fields) if (f.type === "select" && data[f.key] === "" && f.key.endsWith("Id")) data[f.key] = null;
    const r = await send({ type: "codex.save", kind, ...(row ? { id: row.id } : {}), data } as ActionInput);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  // DELETE: removes the entry, then closes the editor; a refusal stays open with the reason.
  const handleDelete = async () => {
    if (!row) return;
    const r = await send({ type: "codex.delete", kind, id: row.id });
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <div className="panel pad stack">
      {fields.map((f) => (
        <div key={f.key} className="field">
          <label className="label" htmlFor={`f-${f.key}`}>
            {f.label}
          </label>
          {f.type === "text" && (
            <input
              id={`f-${f.key}`}
              className="input"
              value={String(draft[f.key] ?? "")}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          )}
          {f.type === "area" && (
            <textarea
              id={`f-${f.key}`}
              className="input"
              value={String(draft[f.key] ?? "")}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          )}
          {f.type === "list" && (
            <input
              id={`f-${f.key}`}
              className="input"
              value={(draft[f.key] as string[]).join(", ")}
              onChange={(e) => setListField({ key: f.key, text: e.target.value })}
            />
          )}
          {f.type === "bool" && (
            <input
              id={`f-${f.key}`}
              type="checkbox"
              style={{ width: 24, height: 24, accentColor: "var(--fg)" }}
              checked={Boolean(draft[f.key])}
              onChange={(e) => setField(f.key, e.target.checked)}
            />
          )}
          {f.type === "select" && (
            <select
              id={`f-${f.key}`}
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
        </div>
      ))}
      {error && <div className="red">! {error}</div>}
      <div className="keys">
        <button className="btn primary" onClick={save}>
          SAVE
        </button>
        <button className="btn" onClick={onDone}>
          CANCEL
        </button>
        {row && (
          <button className="btn danger" onClick={handleDelete}>
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}
