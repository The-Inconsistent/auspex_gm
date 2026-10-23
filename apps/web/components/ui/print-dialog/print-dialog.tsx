"use client";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { HANDOUT_PAPER_KEY, HANDOUT_PAPERS, PAPER_KEY, PAPERS } from "@/lib/print-cards/constants";
import {
  layoutCards,
  printCards,
  printHandouts,
  type Card,
  type HandoutPage,
  type PrintJob,
  type PrintSource,
} from "@/lib/print-cards/print-cards";

import { picturesOf } from "./utils";

type Print = { print: (job: PrintJob) => void };

const PrintContext = createContext<Print | null>(null);

type PrintProviderProps = { source: PrintSource; children: ReactNode };

type Built = { url: string } | { error: string } | "building" | null;

// What a print holds: poker cards (issue #203) or handout pages (issue #204).
type Doc = { kind: "cards"; cards: Card[] } | { kind: "handouts"; pages: HandoutPage[] };

// What differs per kind: the papers offered (the first is the default), where the pick is remembered, and the words.
const KINDS = {
  cards: {
    title: "PRINT CARDS",
    papers: PAPERS,
    key: PAPER_KEY,
    file: "auspex-cards.pdf",
    hint: "Print at 100 % (“Actual size”), not “Fit to page”, so a card is 63 × 88 mm. Cut on the grey lines; fold a tent card on the dashed line, the name facing the players.",
  },
  handouts: {
    title: "PRINT HANDOUTS",
    papers: HANDOUT_PAPERS,
    key: HANDOUT_PAPER_KEY,
    file: "auspex-handouts.pdf",
    hint: "One handout to a page; a long one runs on to the next. For two A5 handouts on one A4 sheet, pick “2 pages per sheet” in the print dialog.",
  },
} as const;
type Paper = (typeof KINDS)[Doc["kind"]]["papers"][number];

const savedPaper = (kind: Doc["kind"]): Paper => {
  const { papers, key } = KINDS[kind];
  try {
    const p = localStorage.getItem(key);
    return papers.find((x) => x === p) ?? papers[0];
  } catch {
    return papers[0]; // storage blocked (private window): the default every time
  }
};

let fontsReady = false; // react-pdf keeps registered fonts per page load

// PRINT on any GM screen (issues #203, #204): the tab names what it wants by id, and this resolves it against what the GM app
// already holds and builds a PDF in this browser. Nothing is uploaded or stored, so a print follows the screen's gates:
// only the GM app mounts this provider. A PDF, not window.print(): its cards sit at fixed millimetres, so the sheet
// prints the same from any device once the dialog's "100 %" is kept.
export function PrintProvider({ source: { state, codex, threats, wargear }, children }: PrintProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<Doc>({ kind: "cards", cards: [] });
  const [paper, setPaper] = useState<Paper>("A4");
  const [built, setBuilt] = useState<Built>(null);
  const sheets = useMemo(() => (doc.kind === "cards" ? layoutCards(doc.cards) : []), [doc]);
  const kind = KINDS[doc.kind];
  const count = doc.kind === "cards" ? doc.cards.length : doc.pages.length;
  const url = useRef<string | null>(null); // the built PDF's blob URL, freed when the dialog closes or the job changes
  // Bumped by every reset (a new job, a paper pick, CLOSE): a build that finishes after one belongs to what the dialog
  // no longer shows, so it's dropped instead of offering the wrong cards or paper.
  const generation = useRef(0);

  const reset = useCallback(() => {
    generation.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setBuilt(null);
  }, []);

  // Resolved when tapped, against the state and codex of that moment.
  const value = useMemo<Print>(
    () => ({
      print: (job) => {
        reset();
        const next: Doc = job.handouts
          ? { kind: "handouts", pages: printHandouts(job, codex) }
          : { kind: "cards", cards: printCards(job, { state, codex, threats, wargear }) };
        setDoc(next);
        setPaper(savedPaper(next.kind));
        dialog.current?.showModal();
      },
    }),
    [reset, state, codex, threats, wargear],
  );

  const pick = (p: Paper) => {
    reset();
    setPaper(p);
    try {
      localStorage.setItem(kind.key, p);
    } catch {} // the pick just isn't remembered
  };

  // Each sheet's paper is one of its own kind's: a card sheet never gets A5.
  const cardBlob = async (cards: Card[]) => {
    const { cardsPdf } = await import("@/components/print/card-sheet/card-sheet");
    const sheet = PAPERS.find((p) => p === paper) ?? PAPERS[0];
    const blob = await cardsPdf({ pages: sheets, paper: sheet, pictures: await picturesOf(cards) });
    return blob;
  };
  const handoutBlob = async (pages: HandoutPage[]) => {
    const { handoutsPdf } = await import("@/components/print/handout-sheet/handout-sheet");
    const blob = await handoutsPdf({ pages, paper: HANDOUT_PAPERS.find((p) => p === paper) ?? HANDOUT_PAPERS[0] });
    return blob;
  };

  // The renderer (and its fonts) loads on the first build only, so the GM app's bundle doesn't carry it.
  const build = async () => {
    const mine = generation.current;
    setBuilt("building");
    try {
      const { registerFonts } = await import("@/components/print/fonts");
      if (!fontsReady) registerFonts(location.origin);
      fontsReady = true;
      const blob = await (doc.kind === "cards" ? cardBlob(doc.cards) : handoutBlob(doc.pages));
      if (mine !== generation.current) return; // the job, the paper or the dialog changed while it built
      url.current = URL.createObjectURL(blob);
      setBuilt({ url: url.current });
    } catch (e) {
      if (mine === generation.current) setBuilt({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <PrintContext value={value}>
      {children}
      <dialog
        ref={dialog}
        className="rule-dialog"
        aria-label={kind.title.toLowerCase()}
        onClose={reset}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          <div className="sb-title">
            <span>{kind.title}</span>
          </div>
          {count === 0 ? (
            <div className="dim">Nothing to print: pick at least one entry.</div>
          ) : (
            <>
              <div>
                {doc.kind === "cards"
                  ? `${count} ${count === 1 ? "card" : "cards"} on ${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}`
                  : `${count} ${count === 1 ? "handout" : "handouts"}`}
              </div>
              <div className="keys" role="group" aria-label="Paper size">
                <span className="label">PAPER</span>
                {kind.papers.map((p) => (
                  <button
                    key={p}
                    className={`btn sm ${paper === p ? "primary" : ""}`}
                    aria-pressed={paper === p}
                    onClick={() => pick(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="dim">{kind.hint}</div>
              <div className="keys">
                {built && typeof built === "object" && "url" in built ? (
                  <>
                    {/* Links the GM taps: iPad Safari blocks a window opened after an await. */}
                    <a className="btn primary" href={built.url} download={kind.file}>
                      DOWNLOAD PDF
                    </a>
                    <a className="btn" href={built.url} target="_blank" rel="noopener">
                      OPEN
                    </a>
                  </>
                ) : (
                  <button className="btn primary" disabled={built === "building"} onClick={build}>
                    {built === "building" ? "BUILDING…" : "BUILD PDF"}
                  </button>
                )}
              </div>
              {built && typeof built === "object" && "error" in built && <div className="red">! {built.error}</div>}
            </>
          )}
          <form method="dialog" className="dlg-foot">
            <button className="btn sm">CLOSE</button>
          </form>
        </div>
      </dialog>
    </PrintContext>
  );
}

export function usePrint(): Print {
  const print = use(PrintContext);
  if (!print) throw new Error("usePrint outside PrintProvider");
  return print;
}
