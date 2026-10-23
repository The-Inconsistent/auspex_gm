"use client";
import type { Character, DerivedStats } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { SheetGuide } from "@/components/ui/sheet-guide/sheet-guide";
import type { Send } from "@/hooks/use-table/use-table";
import { skillRows } from "@/lib/sheet-pools/sheet-pools";

import { DOSSIER_JUMPS } from "../../constants";
import { FoldRow } from "../fold-row/fold-row";
import { GearSupply } from "../gear-supply/gear-supply";
import { Heading } from "../heading/heading";
import { StatBlock } from "../stat-block/stat-block";
import { Wargear } from "../wargear/wargear";
import { WhoYouAre } from "../who-you-are/who-you-are";

type DossierProps = {
  me: Character;
  d: DerivedStats;
  tier: number;
  send: Send;
  buildHref: string;
  onError: (error: string | null) => void;
};

// DOSSIER: the printed stat block first (HOW TO READ THIS SHEET above it, the WARGEAR datacard below), then everything the long sheet held: the dice for every Skill, the Talents and
// abilities with their text, gear and supply, Corruption, the GM's orders, and who the Agent is.
export function Dossier({ me, d, tier, send, buildHref, onError }: DossierProps) {
  const s = me.stats;
  const rules = [...s.abilities, ...s.talents];
  return (
    <>
      <SheetGuide />
      <nav className="ps-jump" aria-label="Jump to">
        {DOSSIER_JUMPS.map((j) => (
          <a key={j.id} href={`#${j.id}`}>
            {j.label}
          </a>
        ))}
      </nav>

      <StatBlock me={me} d={d} tier={tier} />
      <Wargear me={me} />

      {/* A Test rolls Skill + Attribute (Core p.21), so an unrated Skill still rolls its Attribute: shown hollow. */}
      <section className="ps-section" aria-label="Dice to roll">
        <Heading title="DICE TO ROLL" id="ps-skills" aside={<span className="label">SKILL + ATTR</span>} />
        <div className="ps-dice">
          {skillRows(s).map((r) => (
            <div key={r.skill} className="ps-die">
              <span className={r.trained ? "pool-badge" : "pool-badge hollow"}>{r.total}</span>
              <span>
                {r.skill} <span className="ps-attr mono">{r.attribute}</span>
              </span>
            </div>
          ))}
        </div>
        <span className="ps-note">Hollow badges are untrained: the Attribute alone.</span>
      </section>

      <section className="ps-section" aria-label="Talents and abilities">
        <Heading title="TALENTS & ABILITIES" id="ps-talents" />
        {rules.length === 0 && <span className="ps-ink2">None yet.</span>}
        {/* An ability and a Talent can share a name (Hammer of Wrath), so the key carries the place too. */}
        {rules.map((r, i) =>
          r.text ? (
            <FoldRow key={`${r.name}-${i}`} title={r.name} cite={r.page}>
              <p>{r.text}</p>
              {r.page && (
                <span className="ps-cite">
                  <PageCite cite={r.page} />
                </span>
              )}
            </FoldRow>
          ) : (
            <div key={`${r.name}-${i}`} className="ps-fold-head ps-fold-flat">
              <span className="ps-fold-title">{r.name}</span>
              {r.page && <span className="ps-cite">{r.page}</span>}
            </div>
          ),
        )}
      </section>

      <GearSupply me={me} send={send} onError={onError} />

      {/* From the GM, to this Agent only (toPlayerView blanks everyone else's). Folded, so a phone left on the table
          doesn't show them to the player beside it. */}
      <section className="ps-section" aria-label="Orders">
        <Heading title="ORDERS" id="ps-orders" />
        {me.objectives.length === 0 && <span className="ps-ink2">No orders from the GM yet.</span>}
        {me.objectives.map((o, i) => (
          <FoldRow
            key={i}
            tag={o.done ? "DONE" : "SECRET"}
            title={
              <span className={o.done ? "ps-struck" : undefined}>
                {o.done ? "Done. Tap to read." : "Hidden from the table. Tap to read."}
              </span>
            }
          >
            <span className={o.done ? "ps-struck" : undefined}>{o.text}</span>
            {o.done && <span className="sr-only"> (done)</span>}
          </FoldRow>
        ))}
      </section>

      <WhoYouAre me={me} send={send} buildHref={buildHref} onError={onError} />
    </>
  );
}
