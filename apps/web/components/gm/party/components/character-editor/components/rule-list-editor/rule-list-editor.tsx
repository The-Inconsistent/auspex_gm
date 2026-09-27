"use client";
import { useState } from "react";

import type { CharacterStats } from "@wg/shared";

import { RecordList } from "@/components/ui/record-list/record-list";
import type { SheetRuleOption } from "@/lib/sheet-rules/sheet-rules";

type SheetRule = CharacterStats["talents"][number];

type RuleListEditorProps = {
  title: string; // "TALENTS", "ABILITIES"
  owner: string; // the character's name, for the remove buttons' labels
  rules: SheetRule[];
  options: SheetRuleOption[];
  onChange: (rules: SheetRule[]) => void;
};

// The sheet's schema cap (CharacterStats.abilities and .talents).
const MAX_RULES = 30;

// A name and page together tell one printed rule from another of the same name (Tactical Versatility, Core p.113 and
// p.74).
const keyOf = (r: { name: string; page?: string }) => `${r.name}|${r.page ?? ""}`;

// One of a hand-made sheet's rule lists: remove with ✕, or pick from the book, the way the builder picks. The book's
// name, page and text go on the sheet, with the choice in brackets the way the pregens write it ("Acute Sense
// (smell)"). Picking one already on the sheet takes it off again.
export function RuleListEditor({ title, owner, rules, options, onChange }: RuleListEditorProps) {
  const [choice, setChoice] = useState("");
  const onSheet = new Set(rules.map(keyOf));

  const pick = (id: string) => {
    const o = options.find((x) => x.id === id);
    if (!o) return;
    const rule = { name: choice.trim() ? `${o.name} (${choice.trim()})` : o.name, text: o.text, page: o.page };
    if (onSheet.has(keyOf(rule))) onChange(rules.filter((r) => keyOf(r) !== keyOf(rule)));
    else if (rules.length < MAX_RULES) onChange([...rules, rule]);
    setChoice("");
  };

  return (
    <div className="field">
      <span className="label">{title}</span>
      {rules.map((r, i) => (
        <div key={`${keyOf(r)}-${i}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            <b>{r.name}</b>
            {r.page && <span className="dim"> ({r.page})</span>}
          </span>
          <button
            type="button"
            className="btn sm"
            aria-label={`Remove ${r.name} from ${owner}`}
            onClick={() => onChange(rules.toSpliced(i, 1))}
          >
            ✕
          </button>
        </div>
      ))}
      <details>
        <summary className="label">ADD FROM THE BOOKS</summary>
        <div className="stack">
          <input
            className="input"
            maxLength={60}
            aria-label={`${title}: choice for the next pick (optional)`}
            placeholder="Choice in brackets, if any (smell, Orks, the weapon…), then pick"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          />
          {rules.length >= MAX_RULES && <div className="dim">{MAX_RULES} is the most a sheet holds.</div>}
          <RecordList
            label={`Search ${title.toLowerCase()}`}
            searchable
            items={options.map((o) => ({ id: o.id, label: o.name, meta: `${o.from} · ${o.page}`, detail: o.text }))}
            selected={options.filter((o) => !choice.trim() && onSheet.has(keyOf(o))).map((o) => o.id)}
            onPick={pick}
          />
        </div>
      </details>
    </div>
  );
}
