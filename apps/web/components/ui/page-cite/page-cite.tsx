"use client";
import { parseCite } from "@wg/shared";

import { useBooks } from "@/components/ui/books-provider/books-provider";

type PageCiteProps = { cite: string };

// A page cite ("Core p.113") that opens the page while the GM's tablet serves that book; otherwise plain text.
export function PageCite({ cite }: PageCiteProps) {
  const { serves, open } = useBooks();
  const p = parseCite(cite);
  if (!p || !serves(p.source)) return <>{cite}</>;
  return (
    <button
      type="button"
      className="rule-link"
      aria-label={`Open book page ${cite}`}
      onClick={(e) => {
        // Inside a rule's <summary>: open the page, don't toggle the rule.
        e.preventDefault();
        e.stopPropagation();
        open(p, cite);
      }}
    >
      {cite}
    </button>
  );
}
