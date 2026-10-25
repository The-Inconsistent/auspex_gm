"use client";
import { ATTRIBUTES, attributeTotals, withMutations, type Character } from "@wg/shared";

import { Term } from "@/components/ui/term/term";
import { ATTRIBUTE_TERMS } from "@/lib/sheet-terms/sheet-terms";

import { BookBox } from "../book-box/book-box";

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

// ATTRIBUTES as the book's sheet prints them (Core p.40): RATING from creation, BONUS from gear and changes, TOTAL the
// two added, which every Skill and Test rolls (§11.160). Each Attribute opens its meaning.
export function AttributesBox({ me }: { me: Character }) {
  const s = me.stats;
  const total = attributeTotals(s);
  const mutated = ATTRIBUTES.some((a) => withMutations(s).attributes[a] !== s.attributes[a]);
  return (
    <BookBox title="ATTRIBUTES" label="Attributes">
      <div className="bs-at" role="table" aria-label="Attributes">
        <div className="bs-at-row" role="row">
          <span role="columnheader" aria-label="Row" />
          {ATTRIBUTES.map((a) => (
            <span key={a} role="columnheader" className="bs-at-h">
              <Term k={ATTRIBUTE_TERMS[a]}>{a}</Term>
            </span>
          ))}
        </div>
        <div className="bs-at-row" role="row">
          <b role="rowheader">RATING</b>
          {ATTRIBUTES.map((a) => (
            <span key={a} role="cell" className="mono">
              {s.attributes[a]}
            </span>
          ))}
        </div>
        <div className="bs-at-row" role="row">
          <b role="rowheader">
            <Term k="bonus">BONUS</Term>
          </b>
          {ATTRIBUTES.map((a) => {
            const bonus = total[a] - s.attributes[a];
            return (
              <span key={a} role="cell" className={bonus ? "mono bs-at-bonus" : "mono bs-dim"}>
                {bonus ? signed(bonus) : "–"}
              </span>
            );
          })}
        </div>
        <div className="bs-at-row bs-at-total" role="row">
          <b role="rowheader">TOTAL</b>
          {ATTRIBUTES.map((a) => (
            <span key={a} role="cell" className="mono">
              {total[a]}
            </span>
          ))}
        </div>
      </div>
      {s.armour.powered > 0 && (
        <span className="bs-cap">
          S +{s.armour.powered}: {s.armour.name}, Powered ({s.armour.powered}).
        </span>
      )}
      {mutated && <span className="bs-cap">Your mutations count in the bonus.</span>}
    </BookBox>
  );
}
