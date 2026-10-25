"use client";
import type { Character } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";

import { BookBox } from "../book-box/book-box";
import { FoldRow } from "../fold-row/fold-row";

// TALENTS & ABILITIES (Core p.41): each a folded row that opens its text and page. Talents carry a TALENT stamp; the
// sheet doesn't record which ability is the Archetype's or the Species', so abilities carry none. Faith isn't tracked,
// so its box isn't drawn.
// `textless`: what to say under rows with no text (the JOIN page strips it for a guest: book prose needs an account).
export function TalentsBox({ me, textless }: { me: Character; textless?: string }) {
  const s = me.stats;
  const rules = [
    ...s.abilities.map((r) => ({ ...r, talent: false })),
    ...s.talents.map((r) => ({ ...r, talent: true })),
  ];
  return (
    <BookBox title="TALENTS & ABILITIES" id="ps-talents" label="Talents and abilities">
      {rules.length === 0 && <span className="ps-ink2">None yet.</span>}
      {/* An ability and a Talent can share a name (Hammer of Wrath), so the key carries the place too. */}
      {rules.map((r, i) =>
        r.text ? (
          <FoldRow key={`${r.name}-${i}`} title={r.name} cite={r.page} tag={r.talent ? "TALENT" : undefined}>
            <p>{r.text}</p>
            {r.page && (
              <span className="ps-cite">
                <PageCite cite={r.page} />
              </span>
            )}
          </FoldRow>
        ) : (
          <div key={`${r.name}-${i}`} className="ps-fold-head ps-fold-flat">
            {r.talent && <span className="ps-tag mono">TALENT</span>}
            <span className="ps-fold-title">{r.name}</span>
            {r.page && <span className="ps-cite">{r.page}</span>}
          </div>
        ),
      )}
      {textless && rules.some((r) => !r.text) && <span className="bs-cap">{textless}</span>}
    </BookBox>
  );
}
