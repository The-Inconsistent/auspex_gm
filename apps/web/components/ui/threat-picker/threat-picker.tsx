"use client";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  BOOKS,
  THREAT_CLASS_LABEL,
  ThreatClass,
  threatCite,
  threatClassAt,
  type Threat,
  type ThreatSource,
} from "@wg/shared";

import { filterThreats } from "@/lib/threat-filter/threat-filter";

import { FACTION_LABEL, PICK_LIMIT } from "./constants";

type ThreatPickerProps = {
  bestiary: Threat[];
  tier: number;
  onPick: (t: Threat) => void;
  value?: string; // the threat already picked, named on the button
  label?: string; // the button's text while nothing is picked
};

// The GM's way into the bestiary: a search over names and keywords, chips for the faction and for the class printed at
// this campaign's Tier (Core p.323), and a book. A native modal <dialog> brings Escape, the focus trap, focus return
// and the backdrop for free (as Legend does). Book content is GM-only, so this renders in the GM app only.
export function ThreatPicker({ bestiary, tier, onPick, value, label = "+ THREAT…" }: ThreatPickerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState<Threat["faction"] | null>(null);
  const [cls, setCls] = useState<ThreatClass | null>(null);
  const [source, setSource] = useState<ThreatSource | null>(null);

  // Only the facets the loaded bestiary actually holds: a chip that can't match anything is noise.
  const factions = useMemo(() => [...new Set(bestiary.map((t) => t.faction))].sort(), [bestiary]);
  const sources = useMemo(
    () => [...new Set(bestiary.map((t) => t.source))].sort((a, b) => BOOKS[a].name.localeCompare(BOOKS[b].name)),
    [bestiary],
  );
  const picked = bestiary.find((t) => t.id === value);
  const found = filterThreats(bestiary, { query, faction, cls, source }, tier);
  const shown = found.slice(0, PICK_LIMIT);

  // A tap on a row is the pick: it closes the picker and leaves the facets for the next entry.
  const pick = (t: Threat) => {
    onPick(t);
    ref.current?.close();
  };

  // Book select: the empty option is every book.
  const handleSourceChange = (e: ChangeEvent<HTMLSelectElement>) =>
    setSource(sources.find((s) => s === e.target.value) ?? null);

  return (
    <>
      <button
        type="button"
        className="btn"
        style={{ maxWidth: "100%" }}
        // Nothing to pick from means the bestiary fetch failed (`loadBestiary` returns []), and an empty picker would
        // read as a search that is merely too narrow.
        disabled={!bestiary.length}
        aria-label={picked ? `Threat: ${picked.name}, ${threatCite(picked)}. Pick another` : "Pick a threat"}
        onClick={() => ref.current?.showModal()}
      >
        {/* The cite too: a name like Cultist is printed in several books, each its own stat block (rules-flow §11.71). */}
        {picked ? `${picked.name.toUpperCase()} · ${threatCite(picked)}` : label}
      </button>
      <dialog
        ref={ref}
        className="picker"
        aria-label="Pick a threat"
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>BESTIARY · {found.length}</span>
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
        <div className="tp-facets">
          <input
            className="input"
            type="search"
            aria-label="Search the bestiary"
            placeholder="Search: boyz, cultist, poxwalker…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="keys" role="group" aria-label="Threat class at this Tier">
            {ThreatClass.options.map((c) => (
              <button
                key={c}
                className={`btn sm ${cls === c ? "primary" : ""}`}
                aria-pressed={cls === c}
                aria-label={THREAT_CLASS_LABEL[c]}
                onClick={() => setCls(cls === c ? null : c)}
              >
                {c}
              </button>
            ))}
            <select
              className="input"
              style={{ maxWidth: 240 }}
              aria-label="Book"
              value={source ?? ""}
              onChange={handleSourceChange}
            >
              <option value="">EVERY BOOK</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {BOOKS[s].name}
                </option>
              ))}
            </select>
          </div>
          <div className="keys" role="group" aria-label="Faction">
            {factions.map((f) => (
              <button
                key={f}
                className={`btn sm ${faction === f ? "primary" : ""}`}
                aria-pressed={faction === f}
                onClick={() => setFaction(faction === f ? null : f)}
              >
                {FACTION_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          {shown.map((t) => (
            <button key={t.id} className="btn tp-row" aria-pressed={t.id === value} onClick={() => pick(t)}>
              <b>{t.name.toUpperCase()}</b>
              <span className="chip">{THREAT_CLASS_LABEL[threatClassAt(t, tier)]}</span>
              <span className="dim">
                {FACTION_LABEL[t.faction]} · {threatCite(t)}
              </span>
            </button>
          ))}
          {!found.length && <div className="dim">{bestiary.length ? "Nothing matches." : "No bestiary loaded."}</div>}
          {found.length > shown.length && (
            <div className="dim">{found.length - shown.length} more, narrow the search.</div>
          )}
        </div>
      </dialog>
    </>
  );
}
