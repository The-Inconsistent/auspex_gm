"use client";
import { useMemo, useState } from "react";

import {
  BOOKS,
  sourceName,
  flatTree,
  MAX_PLACES_PER_ADD,
  placeTree,
  threatCite,
  type Codex,
  type PlaceNode,
  type PlaceSummary,
  type ThreatSource,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { placeOptions } from "@/lib/places/places";
import { fold } from "@/lib/threat-filter/threat-filter";

type PlacePickerProps = {
  places: PlaceSummary[];
  codex: Pick<Codex, "locations">; // where the copy can go
  send: Send;
  onError: (error: string | null) => void;
  open?: boolean; // NEW CAMPAIGN's SETTING step shows it open; CODEX keeps it folded
};

// ADD FROM BOOK (issue #50): a printed place and every place inside it, picked from each book's tree or by name.
// ADD TO CODEX sends only the place's id: the server copies the printed text into GM NOTES, leaves DESCRIPTION for the
// GM's own words (Core p.315) and starts the copies hidden. Books follow BOOKS, so the Core Rulebook leads.
export function PlacePicker({ places, codex, send, onError, open }: PlacePickerProps) {
  const [source, setSource] = useState<ThreatSource | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PlaceSummary | null>(null);
  const [parentId, setParentId] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  // The books in BOOKS order, each book's tree, and how many places each place holds.
  const { sources, trees, inside } = useMemo(() => {
    const order = Object.keys(BOOKS);
    const sources = [...new Set(places.map((p) => p.source))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const trees = new Map(sources.map((s) => [s, placeTree(places.filter((p) => p.source === s))]));
    const inside = new Map<string, number>();
    const count = (nodes: PlaceNode<PlaceSummary>[]): void =>
      nodes.forEach((n) => (inside.set(n.row.id, n.inside), count(n.children)));
    trees.forEach(count);
    return { sources, trees, inside };
  }, [places]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const q = fold(query.trim());
  const books = source ? [source] : sources;
  const holds = picked ? (inside.get(picked.id) ?? 0) : 0;
  // INSIDE falls back to top level once its place is deleted (here or on another tablet), so ADD never sends a stale id.
  const parent = codex.locations.some((l) => l.id === parentId) ? parentId : "";

  // ADD TO CODEX: one codex.addPlaces; the button waits until it lands.
  const add = async () => {
    if (!picked) return;
    setAdding(true);
    const r = await send({ type: "codex.addPlaces", placeId: picked.id, parentId: parent || null });
    setAdding(false);
    onError(r.ok ? null : r.error);
    setAdded(
      r.ok
        ? `Added ${picked.name}${holds ? ` and the ${holds === 1 ? "place" : `${holds} places`} inside it` : ""}.`
        : null,
    );
  };

  const pick = (p: PlaceSummary) => {
    setPicked(p);
    setAdded(null);
  };

  const row = (p: PlaceSummary, depth: number) => (
    <button
      key={p.id}
      className={`btn sm ${picked?.id === p.id ? "primary" : ""}`}
      style={{ justifyContent: "flex-start", textAlign: "left", paddingLeft: 10 + depth * 16 }}
      aria-pressed={picked?.id === p.id}
      onClick={() => pick(p)}
    >
      <span style={{ flex: 1 }}>{p.name}</span>
      <span className="dim">
        {q ? threatCite(p) : `p.${p.page}`}
        {inside.get(p.id) ? ` · ${inside.get(p.id)} inside` : ""}
      </span>
    </button>
  );

  return (
    <details className="field" open={open}>
      <summary className="label">ADD FROM BOOK</summary>
      <div className="hazard-body" style={{ paddingTop: 8 }}>
        <div className="stack" style={{ gap: 8 }}>
          <input
            className="input"
            aria-label="Search places by name"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="keys" role="group" aria-label="Book" style={{ paddingTop: 0 }}>
            <button
              className={`btn sm ${source ? "" : "primary"}`}
              aria-pressed={!source}
              onClick={() => setSource(null)}
            >
              ALL BOOKS
            </button>
            {sources.map((s) => (
              <button
                key={s}
                className={`btn sm ${s === source ? "primary" : ""}`}
                aria-pressed={s === source}
                onClick={() => setSource(s)}
              >
                {sourceName(s).toUpperCase()}
              </button>
            ))}
          </div>
          <div className="list" style={{ maxHeight: 480, overflowY: "auto" }}>
            {q
              ? places.filter((p) => books.includes(p.source) && fold(p.name).includes(q)).map((p) => row(p, 0))
              : books.map((s) => (
                  <details key={s} open={!!source}>
                    <summary className="label" style={{ cursor: "pointer" }}>
                      {sourceName(s).toUpperCase()} · {places.filter((p) => p.source === s).length}
                    </summary>
                    <div className="list" style={{ paddingTop: 6 }}>
                      {flatTree(trees.get(s) ?? []).map(({ row: p, depth }) => row(p, depth))}
                    </div>
                  </details>
                ))}
            {q && !places.some((p) => books.includes(p.source) && fold(p.name).includes(q)) && (
              <div className="dim">Nothing matches.</div>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {!picked && <div className="dim">Pick a place to see what it copies.</div>}
          {picked && (
            <>
              <b>{picked.name.toUpperCase()}</b>
              <i className="dim">
                {threatCite(picked)}
                {picked.parentId && ` · inside ${byId.get(picked.parentId)?.name ?? "?"}`}
              </i>
              <div>
                <span className="chip">
                  COPIES {picked.name.toUpperCase()}
                  {holds ? ` + ${holds} INSIDE` : ""}
                </span>
              </div>
              <div className="field plate">
                <span className="label">GOES INTO GM NOTES</span>
                <div>
                  The cite, then the printed stat line and hook sidebars where the book has them, then the printed
                  description. Long text stops at a paragraph with where it continues (rules-flow §11.100).
                </div>
              </div>
              <div className="dim">
                DESCRIPTION stays empty: players see it, so write it in your own words (Core p.315). The places start
                HIDDEN.
              </div>
              <div className="field">
                <label className="label" htmlFor="place-inside">
                  INSIDE
                </label>
                <select
                  id="place-inside"
                  className="input"
                  value={parent}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">— TOP LEVEL</option>
                  {placeOptions(codex.locations).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn primary" disabled={adding || holds >= MAX_PLACES_PER_ADD} onClick={add}>
                ADD TO CODEX
              </button>
              {holds >= MAX_PLACES_PER_ADD && (
                <div className="red">! Too many places at once: add the places inside it one by one.</div>
              )}
              {added && <div>{added}</div>}
              <div className="dim">
                Up to {MAX_PLACES_PER_ADD} places per add, so a whole system goes in world by world. The printed text is
                copied into this campaign and its export file.
              </div>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
