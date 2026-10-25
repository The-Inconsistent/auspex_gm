"use client";
import type { Character, DerivedStats } from "@wg/shared";

import { Term } from "@/components/ui/term/term";

type XpBoxProps = { me: Character; d: DerivedStats; buildHref: string };

// The sheet's foot (Core p.41): Passive Awareness (the Stealth score isn't tracked, so its box isn't drawn), XP earned
// and the XP left to spend, and the way to spend it: the builder's ADVANCE screen for a character already made (Core
// pp.146–151), the builder from the top for one that isn't. The server keeps `xpSpent` from the last saved build.
export function XpBox({ me, d, buildHref }: XpBoxProps) {
  const toSpend = Math.max(0, me.xp - me.xpSpent);
  const levelUp = toSpend > 0 && !!me.build;
  return (
    <section className="bs-box" id="ps-xp" aria-label="Awareness and XP">
      <div className="bs-cells bs-cells-3">
        <div className="bs-cell">
          <span className="bs-lbl">
            <Term k="passiveAwareness">PASSIVE AWARENESS</Term>
          </span>
          <span className="bs-v mono">{d.passiveAwareness}</span>
          <span className="bs-cap">half your Awareness dice</span>
        </div>
        <div className="bs-cell">
          <span className="bs-lbl">
            <Term k="xp">XP EARNED</Term>
          </span>
          <span className="bs-v mono">{me.xp}</span>
          <span className="bs-cap">sets your Rank</span>
        </div>
        <div className="bs-cell">
          <span className="bs-lbl">CURRENT XP</span>
          <span className="bs-v mono">{toSpend}</span>
          <span className="bs-cap">to spend</span>
        </div>
      </div>
      <a className={levelUp ? "btn primary" : "btn"} href={buildHref}>
        {levelUp ? `LEVEL UP · SPEND ${toSpend} XP ›` : me.build ? "SPEND XP (BUILDER)" : "CHARACTER BUILDER"}
      </a>
    </section>
  );
}
