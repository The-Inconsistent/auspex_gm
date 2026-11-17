"use client";
import { useRef, useState } from "react";

import {
  SHEET_PAPER_KEY,
  SHEET_STYLE_KEY,
  SHEET_STYLE_LABELS,
  SHEET_STYLES,
  type SheetStyle,
} from "@/components/print/character-sheet/constants";
import type { SheetInput } from "@/components/print/character-sheet/sheet-input";
import { PAPERS, type Paper } from "@/lib/print-cards/constants";

type Built = { url: string } | { error: string } | "building" | null;

const saved = <T extends string>(key: string, options: readonly T[]): T => {
  try {
    return options.find((o) => o === localStorage.getItem(key)) ?? options[0]!;
  } catch {
    return options[0]!; // storage blocked: the default
  }
};

// EXPORT SHEET: the Agent on Cubicle 7's official character sheet as a PDF (print/character-sheet), print-friendly or
// full art. Built in this browser from what the screen already holds, nothing uploaded, so it needs no PrintProvider
// and mounts wherever a seat sees its own sheet: the player's DOSSIER, GM PARTY's SHEET, the builder's REVIEW.
export function SheetExport({ sheet }: { sheet: SheetInput }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [style, setStyle] = useState<SheetStyle>("print");
  const [paper, setPaper] = useState<Paper>("A4");
  const [built, setBuilt] = useState<Built>(null);
  const url = useRef<string | null>(null); // the built PDF's blob URL, freed on close or a new pick
  const generation = useRef(0); // bumped by every reset, so a build that finishes after one is dropped

  const reset = () => {
    generation.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setBuilt(null);
  };

  const handleOpen = () => {
    reset();
    setStyle(saved(SHEET_STYLE_KEY, SHEET_STYLES));
    setPaper(saved(SHEET_PAPER_KEY, PAPERS));
    dialog.current?.showModal();
  };

  const pick = <T extends string>(key: string, value: T, set: (v: T) => void) => {
    reset();
    set(value);
    try {
      localStorage.setItem(key, value);
    } catch {} // the pick just isn't remembered
  };

  // The renderer and its fonts load on the first build only.
  const build = async () => {
    const mine = generation.current;
    setBuilt("building");
    try {
      const [{ registerFontsOnce }, { sheetPdf }] = await Promise.all([
        import("@/components/print/fonts"),
        import("@/components/print/character-sheet/character-sheet"),
      ]);
      registerFontsOnce(location.origin);
      const blob = await sheetPdf({ sheet, style, paper, art: location.origin });
      if (mine !== generation.current) return; // a pick or CLOSE came while it built
      url.current = URL.createObjectURL(blob);
      setBuilt({ url: url.current });
    } catch (e) {
      if (mine === generation.current) setBuilt({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  const file = `${sheet.name.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "agent"}.sheet.pdf`;

  return (
    <>
      <button type="button" className="btn sm" onClick={handleOpen}>
        EXPORT SHEET
      </button>
      <dialog
        ref={dialog}
        className="rule-dialog"
        aria-label="export character sheet"
        onClose={reset}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          <div className="sb-title">
            <span>CHARACTER SHEET</span>
          </div>
          <div>{sheet.name}, on the official Wrath & Glory sheet.</div>
          <div className="keys" role="group" aria-label="Style">
            <span className="label">STYLE</span>
            {SHEET_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn sm ${style === s ? "primary" : ""}`}
                aria-pressed={style === s}
                onClick={() => pick(SHEET_STYLE_KEY, s, setStyle)}
              >
                {SHEET_STYLE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="keys" role="group" aria-label="Paper size">
            <span className="label">PAPER</span>
            {PAPERS.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn sm ${paper === p ? "primary" : ""}`}
                aria-pressed={paper === p}
                onClick={() => pick(SHEET_PAPER_KEY, p, setPaper)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="dim">
            Wrath, Wounds, Shock, Corruption and Notes are left blank for pencil. Print at 100 %.
          </div>
          <div className="keys">
            {built && typeof built === "object" && "url" in built ? (
              <>
                {/* Links to tap: iPad Safari blocks a window opened after an await. */}
                <a className="btn primary" href={built.url} download={file}>
                  DOWNLOAD PDF
                </a>
                <a className="btn" href={built.url} target="_blank" rel="noopener">
                  OPEN
                </a>
              </>
            ) : (
              <button type="button" className="btn primary" disabled={built === "building"} onClick={build}>
                {built === "building" ? "BUILDING…" : "BUILD PDF"}
              </button>
            )}
          </div>
          {built && typeof built === "object" && "error" in built && <div className="red">! {built.error}</div>}
          <form method="dialog" className="dlg-foot">
            <button className="btn sm">CLOSE</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
