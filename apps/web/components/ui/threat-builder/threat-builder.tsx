"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CustomThreatData, customThreatId, type PoolPresetTable, type Wargear } from "@wg/shared";

import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import { PARTS, TAP_SETTLE_MS, type Part, type ThreatDraft } from "./constants";
import { ThreatForm } from "./components/threat-form/threat-form";
import { threatHints } from "./hints";

type ThreatBuilderProps = {
  start: { slug: string | null; draft: ThreatDraft }; // slug null: a new one, the server makes the slug
  tier: number;
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null; // Threat Assessment p.7, offered as RUIN abilities
  send: Send;
  onSaved: (threatId: string) => void; // `custom-<slug>`, the id every picker and encounter entry uses
  onCancel: () => void;
  page?: boolean; // CODEX's own page: the jump strip and a sticky save bar. Inside a scene's editor, which has its own, neither
  more?: ReactNode; // CODEX's CLONE and DELETE, folded behind MORE in the save bar
};

// One custom stat block being written (issue #43): the form, the block as it will print beside it, CREATE or SAVE and
// CANCEL. Shared: CODEX › THREATS opens it as a page, and a scene's + NEW CUSTOM THREAT inside its editor, which adds
// the new threat to its prepared encounter. A fresh mount per open, so no mark or refusal is left from the last one.
export function ThreatBuilder({
  start,
  tier,
  wargear,
  ruinActions,
  send,
  onSaved,
  onCancel,
  page,
  more,
}: ThreatBuilderProps) {
  const [draft, setDraft] = useState(start.draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const fields = useFieldErrors("t-");

  // The strip follows the part on screen, as the scene editor's does (beat-editor). A tap marks its part at once, and
  // the scroll it starts mustn't mark the parts it passes.
  const [part, setPart] = useState<Part>("identity");
  const tapped = useRef(0);
  // External system: the DOM's scroll, which happens in the GM body (a scroll event doesn't bubble, hence capture).
  useEffect(() => {
    if (!page) return;
    const follow = () => {
      if (Date.now() - tapped.current < TAP_SETTLE_MS) return;
      const line = (document.querySelector(".th-strip")?.getBoundingClientRect().bottom ?? 0) + 8;
      const passed = PARTS.filter(
        ([id]) => (document.getElementById(`th-${id}`)?.getBoundingClientRect().top ?? Infinity) <= line,
      );
      setPart(passed.at(-1)?.[0] ?? "identity");
    };
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", follow, { capture: true });
  }, [page]);
  const counts: Partial<Record<Part, number>> = {
    skills: draft.skills.list.length,
    bonuses: draft.bonuses?.length ?? 0,
    abilities: draft.abilities?.length ?? 0,
    mob: draft.mobAbilities?.length ?? 0,
  };

  // The block as it will print: the server's schema fills the defaults; until it reads (no name yet), there is none.
  const parsed = CustomThreatData.safeParse(draft);
  const preview = parsed.success ? { ...parsed.data, id: "custom-preview", source: "custom" as const, page: 0 } : null;
  // Why there is none: a name and a keyword first, then whatever else the schema refuses (the last Tier's "–").
  const waiting =
    !draft.name.trim() || !draft.keywords.length
      ? "The preview waits for a name and a keyword."
      : `The preview waits: ${parsed.error?.issues[0]?.message ?? "a field doesn't read yet"}.`;
  const hints = threatHints(draft);
  const changed = (Object.keys(draft) as (keyof ThreatDraft)[]).filter(
    (k) => JSON.stringify(draft[k]) !== JSON.stringify(start.draft[k]),
  ).length;

  // CREATE or SAVE: the server's own schema first, so a missing NAME or Keyword is marked on its field.
  const save = async () => {
    setError(null);
    if (!fields.check(CustomThreatData, draft)) return;
    setBusy(true);
    const r = await send({ type: "threat.save", ...(start.slug ? { slug: start.slug } : {}), data: draft });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const slug = r.slug ?? start.slug;
    if (slug) onSaved(customThreatId(slug));
  };

  // A refusal inside a list (an ability, a weapon) has no field of its own: it says where.
  const fault = error ?? fields.elsewhere(["name", "keywords"]);

  return (
    <div className="th-ed">
      {page && (
        <nav className="ed-strip th-strip" aria-label="Parts of this stat block">
          {PARTS.map(([id, label]) => (
            <a
              key={id}
              href={`#th-${id}`}
              aria-current={part === id ? "true" : undefined}
              // Inline, as beat-editor's: react-hooks/purity reads Date.now() in a named handler as render work.
              onClick={() => {
                tapped.current = Date.now();
                setPart(id);
              }}
            >
              {label}
              {counts[id] !== undefined && <span>{counts[id]}</span>}
            </a>
          ))}
        </nav>
      )}
      <div className="th-split">
        <ThreatForm
          draft={draft}
          tier={tier}
          wargear={wargear}
          ruinActions={ruinActions}
          fields={fields}
          onChange={setDraft}
        />
        <aside className="th-aside" aria-label="The stat block as it will print">
          <span className="label">AS IT PRINTS</span>
          {preview ? <StatBlock t={preview} tier={tier} /> : <span className="dim">{waiting}</span>}
          {hints.length > 0 && (
            <div className="field plate">
              <span className="label warn">WORTH A LOOK</span>
              {hints.map((h) => (
                <div key={h} className="dim">
                  {h}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <div className={page ? "ed-bar" : "keys th-bar"}>
        <span className={`ed-state ${fault ? "red" : ""}`} role="status">
          {fault
            ? `! ${fault}`
            : !start.slug
              ? "NOT SAVED YET"
              : changed
                ? `${changed} UNSAVED ${changed === 1 ? "CHANGE" : "CHANGES"}`
                : "NO CHANGES"}
        </span>
        {more && showMore && more}
        {more && (
          <button className="btn" aria-expanded={showMore} onClick={() => setShowMore((m) => !m)}>
            {showMore ? "LESS" : "MORE"}
          </button>
        )}
        {/* Not mid-save: the save would still land, and a scene would still add it after CANCEL. */}
        <button className="btn" disabled={busy} onClick={onCancel}>
          CANCEL
        </button>
        <button className="btn primary" aria-busy={busy} disabled={busy} onClick={save}>
          {start.slug ? "SAVE THREAT" : "CREATE THREAT"}
        </button>
      </div>
    </div>
  );
}
