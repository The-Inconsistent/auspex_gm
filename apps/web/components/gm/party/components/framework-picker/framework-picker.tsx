"use client";
import { useMemo, useState } from "react";

import { BOOKS, type FrameworkCatalogue, type Source } from "@wg/shared";

import { requirementText } from "@/components/builder/utils";

import { frameworkEntries, grantText, tierLabel, tierRange, type FrameworkEntry } from "./utils";

type FrameworkPickerProps = {
  catalogue: FrameworkCatalogue;
  tier: number;
  patron: string; // what PATRON holds now, kept when a Framework has no patron
  onUse: (picked: { patron: string; framework: string }) => void;
  onClose: () => void;
};

const ALL = "all";

// START FROM A FRAMEWORK (issue #45): the printed Frameworks, by book and patron. The preview is book text for the GM;
// USE fills in only the patron's and the Framework's names, and never the Tier (rules-flow §11.80).
export function FrameworkPicker({ catalogue, tier, patron, onUse, onClose }: FrameworkPickerProps) {
  const entries = useMemo(() => frameworkEntries(catalogue), [catalogue]);
  const books = useMemo(() => [...new Set(entries.map((e) => e.source))], [entries]);
  const patrons = useMemo(() => [...new Set(entries.flatMap((e) => (e.patron ? [e.patron] : [])))], [entries]);
  const [query, setQuery] = useState("");
  const [book, setBook] = useState<Source | typeof ALL>(ALL);
  const [byPatron, setByPatron] = useState<string>(ALL);
  const [picked, setPicked] = useState<FrameworkEntry | null>(null);

  const q = query.trim().toLowerCase();
  const shown = entries.filter(
    (e) =>
      (book === ALL || e.source === book) &&
      (byPatron === ALL || e.patron === byPatron) &&
      (!q || e.name.toLowerCase().includes(q) || !!e.patron?.toLowerCase().includes(q)),
  );
  const groups = books.flatMap((b) => {
    const list = shown.filter((e) => e.source === b);
    return list.length ? [{ book: b, list }] : [];
  });
  const range = picked && tierRange(picked.body);
  const offTier = range && (tier < range.min || tier > range.max);
  const nowPatron = picked?.patron ?? patron;

  // USE: the names go into the form; SAVE sends them.
  const use = () => {
    if (!picked) return;
    onUse({ patron: nowPatron, framework: picked.name });
  };

  return (
    <section className="fw-picker" aria-label="Start from a Framework">
      <div className="tbar iron">
        <span>START FROM A FRAMEWORK</span>
        <span>
          {entries.length} FRAMEWORKS · {books.length} BOOKS{" "}
          <button className="btn sm" aria-label="Close the Framework list" onClick={onClose}>
            ×
          </button>
        </span>
      </div>
      <div className="pad stack">
        <div className="fw-filters">
          <input
            className="input"
            aria-label="Search by Framework or patron name"
            placeholder="Search by Framework or patron name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="input" aria-label="Patron" value={byPatron} onChange={(e) => setByPatron(e.target.value)}>
            <option value={ALL}>ALL PATRONS</option>
            {patrons.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="keys" role="group" aria-label="Book">
          <button
            className={`btn sm ${book === ALL ? "primary" : ""}`}
            aria-pressed={book === ALL}
            onClick={() => setBook(ALL)}
          >
            ALL BOOKS · {entries.length}
          </button>
          {books.map((b) => (
            <button
              key={b}
              className={`btn sm ${book === b ? "primary" : ""}`}
              aria-pressed={book === b}
              onClick={() => setBook(b)}
            >
              {BOOKS[b].name.toUpperCase()} · {entries.filter((e) => e.source === b).length}
            </button>
          ))}
        </div>
        {entries.length === 0 && <div className="dim">No Frameworks loaded. Type your own above.</div>}
        <div className="fw-body">
          <div className="fw-list">
            {groups.map(({ book: b, list }) => (
              <div key={b}>
                <div className="tbar iron">
                  <span>{BOOKS[b].name.toUpperCase()}</span>
                  <span>{list.length}</span>
                </div>
                {list.map((e, i) => {
                  const r = tierRange(e.body);
                  const head = e.patron !== list[i - 1]?.patron;
                  return (
                    <div key={e.key}>
                      {head && (
                        <div className="label fw-patron">
                          {e.patron ? `${e.patron.toUpperCase()} · P.${e.page}` : "NO PATRON"}
                        </div>
                      )}
                      <button
                        className={`fw-row ${picked?.key === e.key ? "on" : ""}`}
                        aria-pressed={picked?.key === e.key}
                        onClick={() => setPicked(e)}
                      >
                        <span>{e.name}</span>
                        {r && <span className="chip">{tierLabel(r)}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {picked ? (
            <div className="stack fw-preview">
              <div className="setup-step">
                <b className="display">{picked.name.toUpperCase()}</b>
                {range && <span className="chip">PRINTED FOR {tierLabel(range)}</span>}
              </div>
              <i className="dim">
                {picked.patron ? `Patron: ${picked.patron} · ` : ""}
                {BOOKS[picked.source].name} p.{picked.page}
              </i>
              {offTier && (
                <div className="chip warn">
                  This campaign is Tier {tier}. The Tier is a hint only: USE leaves it at {tier}.
                </div>
              )}
              <div className="plate stack">
                <div className="label">BOOK TEXT · GM ONLY</div>
                {picked.body.text && <pre className="text">{picked.body.text}</pre>}
                {(
                  [
                    ["LIMITATIONS", picked.body.limitations.map(requirementText)],
                    ["WARGEAR", picked.body.wargear.map(grantText)],
                    ["BONUS", picked.body.bonus ? [picked.body.bonus] : []],
                    ["TYPICAL CHARACTERS", picked.body.characters ? [picked.body.characters] : []],
                    ["TYPICAL ENEMIES", picked.body.enemies ? [picked.body.enemies] : []],
                  ] as const
                )
                  .filter(([label, lines]) => lines.length || !label.startsWith("TYPICAL"))
                  .map(([label, lines]) => (
                    <div key={label} className="fw-line">
                      <span className="label">{label}</span>
                      <span>{lines.length ? lines.join("; ") : "none printed"}</span>
                    </div>
                  ))}
              </div>
              <div className="fw-phone">
                <span className="label">A PHONE SHOWS</span> <b>MISSION</b> {picked.name}
                {nowPatron && (
                  <>
                    {" "}
                    · <b>PATRON</b> {nowPatron}
                  </>
                )}
              </div>
              <div className="keys">
                <button className="btn primary" onClick={use}>
                  USE
                </button>
                <button className="btn" onClick={onClose}>
                  CANCEL
                </button>
                <i className="dim">Fills PATRON and FRAMEWORK above. Nothing is saved until SAVE.</i>
              </div>
            </div>
          ) : (
            <div className="dim">Pick a Framework to read it.</div>
          )}
        </div>
      </div>
    </section>
  );
}
