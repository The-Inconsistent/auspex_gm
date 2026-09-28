"use client";
import { createContext, use, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import type { BookPage, ThreatSource } from "@wg/shared";

import type { RequestPage } from "@/hooks/use-table/use-table";

type Books = {
  serves: (source: ThreatSource) => boolean;
  open: (p: BookPage, cite: string) => void;
};

const BooksContext = createContext<Books | null>(null);

type BooksProviderProps = { books: ThreatSource[]; requestPage: RequestPage; children: ReactNode };

type Shown = { n: number; cite: string; url?: string; error?: string };

// The book pages the GM's tablet is serving right now (gm/books), and one dialog that shows a page over the current
// screen. The page is a JPEG the GM's tablet rendered from its own PDF; it lives in this tab's memory until closed.
export function BooksProvider({ books, requestPage, children }: BooksProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<Shown>({ n: 0, cite: "" });
  // The newest open, so a slow reply for a page the reader already left doesn't replace the one they asked for next.
  const latest = useRef(0);

  const value = useMemo<Books>(
    () => ({
      serves: (source) => books.includes(source),
      open: (p, cite) => {
        const n = ++latest.current;
        flushSync(() => setShown((s) => (release(s), { n, cite })));
        dialog.current?.showModal();
        void requestPage(p).then((r) => {
          if (latest.current !== n) return;
          const next = r.ok
            ? { url: URL.createObjectURL(new Blob([r.image], { type: "image/jpeg" })) }
            : { error: r.error };
          setShown((s) => (s.n === n ? { ...s, ...next } : s));
        });
      },
    }),
    [books, requestPage],
  );

  // Closing drops the image, so a page isn't kept past the moment it was asked for.
  const onClose = () => {
    latest.current++;
    setShown((s) => (release(s), { n: s.n, cite: "" }));
  };

  return (
    <BooksContext value={value}>
      {children}
      {/* Native modal, as the rule dialog: Esc or a backdrop tap closes it. Pinch-zoom works on the image. */}
      <dialog
        ref={dialog}
        className="rule-dialog book-dialog"
        aria-label={`Book page: ${shown.cite}`}
        onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          <div className="label">{shown.cite}</div>
          {shown.url ? (
            // A blob: URL from the GM's tablet; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="book-page" src={shown.url} alt={`Book page ${shown.cite}`} />
          ) : (
            <p className="dim" role="status">
              {shown.error ?? "Asking the GM's tablet for the page…"}
            </p>
          )}
          <form method="dialog">
            <button className="btn primary">CLOSE</button>
          </form>
        </div>
      </dialog>
    </BooksContext>
  );
}

const release = (s: Shown) => s.url && URL.revokeObjectURL(s.url);

export function useBooks(): Books {
  const books = use(BooksContext);
  if (!books) throw new Error("useBooks outside BooksProvider");
  return books;
}
