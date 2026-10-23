"use client";
import { keywordText } from "@wg/data/keyword-texts";

import { Pop } from "@/components/ui/term/term";

// One of a sheet's Keywords, tapped for the book's full text of it (the publisher approved faction Keyword text for
// anyone, CLAUDE.md). A filled bracket (SPACE WOLVES) reads the bracket's text ([CHAPTER]); a Keyword no book in the
// data names (a Chapter the books don't list, a campaign's own) stays plain.
export function KeywordPop({ name }: { name: string }) {
  const k = keywordText(name);
  if (!k) return <>{name}</>;
  return (
    <Pop
      title={k.kind ? `${name}: ${k.kind}` : name}
      cite={k.cite}
      body={k.text || "The books name this Keyword without describing it."}
    >
      {name}
    </Pop>
  );
}
