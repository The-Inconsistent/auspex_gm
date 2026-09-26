"use client";
import { useState } from "react";

import type { RuleEntry } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

import { RULE_FILTERS, type RuleFilter } from "./constants";

// Case-insensitive, and curly quotes match straight ones ("’Ere We Go!" as printed vs a typed "'ere").
const fold = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");

type RulesRefProps = { rules: RuleEntry[] };

// Searchable rules reference (Conditions, weapon and armour traits, combat actions, stat block terms), shared by the
// GM and player apps.
export function RulesRef({ rules }: RulesRefProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RuleFilter>("ALL");
  const q = fold(query.trim());
  const kind = RULE_FILTERS[filter];
  const shown = rules
    .filter(
      (r) =>
        (!kind || r.kind === kind) && (!q || [r.name, r.abbr ?? "", r.gist, r.text].some((t) => fold(t).includes(q))),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <input
        className="input"
        type="search"
        aria-label="Search the rules"
        placeholder="Search: prone, blast, charge…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <nav className="tabs sub" role="tablist" aria-label="Rule kind">
        {(Object.keys(RULE_FILTERS) as RuleFilter[]).map((f) => (
          <button key={f} role="tab" className="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </nav>
      {rules.length === 0 && <div className="dim">Rules archive unreachable.</div>}
      {rules.length > 0 && shown.length === 0 && <div className="dim">No matching rules.</div>}
      <div className="list">
        {shown.map((r) => (
          <RuleItem key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
