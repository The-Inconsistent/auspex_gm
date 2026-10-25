"use client";
import { rankOf, type Character } from "@wg/shared";

import { KeywordPop } from "@/components/ui/keyword-pop/keyword-pop";
import { Term } from "@/components/ui/term/term";

type SheetHeadProps = { me: Character; tier: number };

// The sheet's Personal Details (Core p.40): our crimson name bar and iron TIER · SPECIES · XP strip, then the book's
// labelled lines. Faction and Background aren't on a built sheet, so they aren't drawn (an empty box is noise).
export function SheetHead({ me, tier }: SheetHeadProps) {
  const s = me.stats;
  return (
    <section className="bs-head" id="ps-attr" aria-label="Personal details">
      <div className="ps-spikes" aria-hidden="true" />
      <div className="ps-btitle">{me.name.toUpperCase()}</div>
      <div className="ps-bmeta">
        <b>
          <Term k="tier">TIER</Term>
        </b>
        <span className="mono">{tier}</span>
        <b>
          <Term k="species">SPECIES</Term>
        </b>
        <span>{s.species}</span>
        <b>
          <Term k="xp">XP</Term>
        </b>
        <span className="mono">{me.xp}</span>
      </div>
      <div className="bs-fields">
        <div className="bs-fld">
          <b>
            <Term k="rank">RANK</Term>:
          </b>
          <span className="mono">{rankOf(me.xp)}</span>
        </div>
        <div className="bs-fld">
          <b>
            <Term k="archetype">ARCHETYPE</Term>:
          </b>
          <span>{s.archetype || "None"}</span>
        </div>
        {s.keywords.length > 0 && (
          <div className="bs-fld">
            <b>
              <Term k="keywords">KEYWORDS</Term>:
            </b>
            <span className="ps-kw">
              {s.keywords.map((k, i) => (
                <span key={k}>
                  {i > 0 && ", "}
                  <KeywordPop name={k} />
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
