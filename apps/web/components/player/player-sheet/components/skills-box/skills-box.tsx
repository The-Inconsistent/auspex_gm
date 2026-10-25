"use client";
import { withMutations, type Character } from "@wg/shared";

import { Term } from "@/components/ui/term/term";
import { skillRows } from "@/lib/sheet-pools/sheet-pools";
import { SKILL_TERMS } from "@/lib/sheet-terms/sheet-terms";

import { BookBox } from "../book-box/book-box";

// SKILLS as the book's sheet prints them (Core p.40): two columns of nine, each Skill with its Attribute in grey, its
// Rating, and the TOTAL as our dice badge (Rating + the Attribute's TOTAL, Core p.21, §11.160). An untrained Skill still
// rolls its Attribute: a hollow badge.
export function SkillsBox({ me }: { me: Character }) {
  const rows = skillRows(me.stats);
  const rating = withMutations(me.stats).skills;
  const columns = [rows.slice(0, 9), rows.slice(9)];
  return (
    <BookBox title="SKILLS" id="ps-skills" label="Skills">
      <span className="bs-cap">
        Each Skill, its Attribute in grey, its Rating, then its TOTAL: Rating + Attribute, the{" "}
        <Term k="dice">dice</Term> you roll. Hollow: untrained, the Attribute alone.
      </span>
      <div className="bs-sk">
        {columns.map((col, i) => (
          <div
            key={i}
            className="bs-skc"
            role="table"
            aria-label={i ? "Skills, Medicae to Weapon Skill" : "Skills, Athletics to Leadership"}
          >
            {/* the heads for a screen reader: 12px RATING and TOTAL don't fit over these columns, so the caption
                above says what each column is */}
            <div className="sr-only" role="row">
              <span role="columnheader">Skill</span>
              <span role="columnheader">Attribute</span>
              <span role="columnheader">Rating</span>
              <span role="columnheader">Total</span>
            </div>
            {col.map((r) => (
              <div key={r.skill} className="bs-skc-row" role="row">
                <span role="cell" className="bs-skc-n">
                  <Term k={SKILL_TERMS[r.skill]}>{r.skill}</Term>
                </span>
                <span role="cell" className="bs-skc-a mono">
                  {r.attribute}
                </span>
                <span role="cell" className={r.trained ? "mono" : "mono bs-dim"}>
                  {r.trained ? rating[r.skill] : "–"}
                </span>
                <span role="cell">
                  <span className={r.trained ? "pool-badge" : "pool-badge hollow"}>{r.total}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </BookBox>
  );
}
