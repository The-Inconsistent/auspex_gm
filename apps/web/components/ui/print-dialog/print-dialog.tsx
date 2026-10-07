"use client";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { PAPER_KEY, PAPERS, type Paper } from "@/lib/print-cards/constants";
import { layoutCards, printCards, type Card, type PrintJob, type PrintSource } from "@/lib/print-cards/print-cards";

import { picturesOf } from "./utils";

type Print = { print: (job: PrintJob) => void };

const PrintContext = createContext<Print | null>(null);

type PrintProviderProps = { source: PrintSource; children: ReactNode };

type Built = { url: string } | { error: string } | "building" | null;

const savedPaper = (): Paper => {
  try {
    const p = localStorage.getItem(PAPER_KEY);
    return PAPERS.find((x) => x === p) ?? "A4";
  } catch {
    return "A4"; // storage blocked (private window): A4 every time
  }
};

let fontsReady = false; // react-pdf keeps registered fonts per page load

// PRINT on any GM screen (issue #203): the tab names what it wants by id, and this resolves it against what the GM app
// already holds and builds a PDF in this browser. Nothing is uploaded or stored, so a print follows the screen's gates:
// only the GM app mounts this provider. A PDF, not window.print(): its cards sit at fixed millimetres, so the sheet
// prints the same from any device once the dialog's "100 %" is kept.
export function PrintProvider({ source: { state, codex, threats, wargear }, children }: PrintProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [paper, setPaper] = useState<Paper>("A4");
  const [built, setBuilt] = useState<Built>(null);
  const pages = useMemo(() => layoutCards(cards), [cards]);
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
        setCards(printCards(job, { state, codex, threats, wargear }));
        setPaper(savedPaper());
        dialog.current?.showModal();
      },
    }),
    [reset, state, codex, threats, wargear],
  );

  const pick = (p: Paper) => {
    reset();
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {} // the pick just isn't remembered
  };

  // The renderer (and its fonts) loads on the first build only, so the GM app's bundle doesn't carry it.
  const build = async () => {
    const mine = generation.current;
    setBuilt("building");
    try {
      const { cardsPdf, registerFonts } = await import("@/components/print/card-sheet/card-sheet");
      if (!fontsReady) registerFonts(location.origin);
      fontsReady = true;
      const blob = await cardsPdf({ pages, paper, pictures: await picturesOf(cards) });
      if (mine !== generation.current) return; // the job, the paper or the dialog changed while it built
      url.current = URL.createObjectURL(blob);
      setBuilt({ url: url.current });
    } catch (e) {
      if (mine === generation.current) setBuilt({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  const sheets = pages.length;
  return (
    <PrintContext value={value}>
      {children}
      <dialog
        ref={dialog}
        className="rule-dialog"
        aria-label="Print cards"
        onClose={reset}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          <div className="sb-title">
            <span>PRINT CARDS</span>
          </div>
          {cards.length === 0 ? (
            <div className="dim">Nothing to print: pick at least one entry.</div>
          ) : (
            <>
              <div>
                {cards.length} {cards.length === 1 ? "card" : "cards"} on {sheets} {sheets === 1 ? "sheet" : "sheets"}
              </div>
              <div className="keys" role="group" aria-label="Paper size">
                <span className="label">PAPER</span>
                {PAPERS.map((p) => (
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
              <div className="dim">
                Print at 100 % (“Actual size”), not “Fit to page”, so a card is 63 × 88 mm. Cut on the grey lines; fold
                a tent card on the dashed line, the name facing the players.
              </div>
              <div className="keys">
                {built && typeof built === "object" && "url" in built ? (
                  <>
                    {/* Links the GM taps: iPad Safari blocks a window opened after an await. */}
                    <a className="btn primary" href={built.url} download="auspex-cards.pdf">
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
          <form method="dialog">
            <button className="btn">CLOSE</button>
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
