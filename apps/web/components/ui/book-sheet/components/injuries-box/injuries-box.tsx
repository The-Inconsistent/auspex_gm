"use client";
import { CHAOS_SPAWN_AT, corruptionLevel, effectiveStrength, type Character, type DerivedStats } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { Term } from "@/components/ui/term/term";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";

import { BookBox } from "../book-box/book-box";

// The sheet's rows of circles (Core p.41): the first point of each level before Chaos Spawn, read from corruptionLevel
// (Contaminated from 11, §11.5), so the rows follow a change there. Pure counts from 0, so its circles start at 1.
const ROWS = Array.from({ length: CHAOS_SPAWN_AT - 1 }, (_, i) => i + 1).filter(
  (p) => p === 1 || corruptionLevel(p).level !== corruptionLevel(p - 1).level,
);

// INJURIES & CORRUPTION (Core p.41): Traumatic Injuries against their maximum, Mutations, and Corruption as the sheet's
// rows of circles with the level named. Memorable Injuries aren't tracked, so that column isn't drawn. The GM changes
// all of it.
export function InjuriesBox({ me, d }: { me: Character; d: DerivedStats }) {
  const s = me.stats;
  const level = corruptionLevel(s.corruption);
  return (
    <BookBox title="INJURIES & CORRUPTION" id="ps-injuries" label="Injuries and corruption">
      <div className="bs-cells bs-cells-2 bs-rule-under">
        <div className="bs-cell">
          <span className="bs-lbl">
            <Term k="traumatic">TRAUMATIC INJURIES</Term>
          </span>
          <span className="bs-v mono">
            {me.traumatic}
            <small> / {d.maxTraumatic}</small>
          </span>
          <span className="bs-cap">max = Tier + 1; more and you die</span>
        </div>
        <div className="bs-cell">
          <span className="bs-lbl">
            <Term k="mutations">MUTATIONS</Term>
          </span>
          <span className="bs-cell-text">{s.mutations.length ? s.mutations.length : "None"}</span>
        </div>
      </div>
      {s.mutations.map((m) => (
        <div key={m.id} className="ps-item">
          <b className="ps-weapon-name">{m.name}</b>{" "}
          <span className="ps-cite">
            (<PageCite cite={`Core p.${m.page}`} />)
          </span>
          <div className="ps-pre">{m.effect}</div>
          {m.weapons.map((w) => (
            <WeaponLine key={w.name} weapon={w} strength={effectiveStrength(s)} />
          ))}
        </div>
      ))}
      <div className="bs-corruption">
        <div className="bs-cell bs-cell-start">
          <span className="bs-lbl">
            <Term k="corruption">CORRUPTION</Term>
          </span>
          <span className="bs-v mono">{s.corruption}</span>
          <span className="bs-cap">
            {level.chaosSpawn
              ? "Chaos Spawn: the GM takes this Agent over (p.286)."
              : `${level.name}: +${level.modifier} to Corruption Test DNs (p.286). ${CHAOS_SPAWN_AT} points: Chaos Spawn.`}
          </span>
        </div>
        <div className="bs-pips" role="img" aria-label={`Corruption ${s.corruption}: ${level.name}`}>
          {ROWS.map((from) => {
            const row = corruptionLevel(from);
            return (
              <div key={from} className="bs-pip-row">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className={from + i <= s.corruption ? "bs-pip bs-pip-on" : "bs-pip"} />
                ))}
                <b className={row.level === level.level ? "bs-pip-now" : undefined}>{row.name.toUpperCase()}</b>
              </div>
            );
          })}
        </div>
      </div>
    </BookBox>
  );
}
