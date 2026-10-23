"use client";
import Image from "next/image";
import { useRef, useState, type MouseEvent } from "react";

import { ATTRIBUTES, deriveStats, withMutations, type Character } from "@wg/shared";

import { StatBlock } from "@/components/player/player-sheet/components/stat-block/stat-block";
import { Wargear } from "@/components/player/player-sheet/components/wargear/wargear";
import { DetailView, hasDetail } from "@/components/ui/character-detail/character-detail";
import { KeywordPop } from "@/components/ui/keyword-pop/keyword-pop";
import { SheetGuide } from "@/components/ui/sheet-guide/sheet-guide";
import { Term } from "@/components/ui/term/term";
import { portrait } from "@/lib/portraits/portraits";
import { topSkills } from "@/lib/sheet-pools/sheet-pools";
import { ATTRIBUTE_TERMS, SKILL_TERMS } from "@/lib/sheet-terms/sheet-terms";

import { CARD_SKILLS } from "./constants";

type AgentCardProps = {
  c: Character;
  tier: number;
  play: { label: string; busy: boolean; onPlay: () => void };
};

// One Agent to choose before taking a seat, skimmable at a glance: who, the Attributes, the best Skills and the
// weapons. READ opens the Agent's BACKGROUND (appearance, past, personality) as the long sheet folds it, then
// the book's printed stat block (Core p.117), the same one the player's DOSSIER starts with. The
// preview has already stripped Ability and Talent text (book prose needs a seat), so only names and cites show.
export function AgentCard({ c, tier, play }: AgentCardProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const s = c.stats;
  const built = !!(s.archetype || s.species); // a reserve Agent nobody has built yet has an empty sheet
  const lore = hasDetail(c.detail); // the player's own words (appearance, past, personality), not book prose
  const pic = portrait(c.detail.portrait);
  const attrs = withMutations(s).attributes;

  // READ: render the block, then open the modal (Escape, focus trap, focus return, backdrop).
  const handleRead = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  // A click on the dialog element itself, not its content, is a click on the backdrop: close.
  const handleBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) ref.current?.close();
  };

  return (
    <article className="pick agent-pick">
      {pic && <Image src={pic} alt="" width={144} className="portrait-thumb" />}
      <div className="agent-pick-body">
        <b className="display agent-pick-name">{c.name.toUpperCase()}</b>
        <i className="dim">{[s.archetype, s.species].filter(Boolean).join(" · ") || "No sheet yet"}</i>
        {s.keywords.length > 0 && (
          <span className="kw">
            {s.keywords.map((k, i) => (
              <span key={k}>
                {i > 0 && " · "}
                <KeywordPop name={k} />
              </span>
            ))}
          </span>
        )}
        {built && (
          <>
            <div className="agent-attrs" aria-label="Attributes">
              {ATTRIBUTES.map((a) => (
                <Term key={a} k={ATTRIBUTE_TERMS[a]}>
                  <b>{a}</b>
                  <span className="mono">{attrs[a]}</span>
                </Term>
              ))}
            </div>
            <div className="agent-skills" aria-label="Best Skills, dice to roll">
              <Term k="dice">
                <span className="label">BEST DICE</span>
              </Term>
              {topSkills(s, CARD_SKILLS).map((r) => (
                <span key={r.skill}>
                  <span className={r.trained ? "pool-badge" : "pool-badge hollow"}>{r.total}</span>
                  <Term k={SKILL_TERMS[r.skill]}>{r.skill}</Term>
                </span>
              ))}
            </div>
            {s.weapons.length > 0 && <span className="agent-arms">{s.weapons.map((w) => w.name).join(" · ")}</span>}
          </>
        )}
        <div className="keys" style={{ paddingTop: 2 }}>
          <button className="btn primary" disabled={play.busy} onClick={play.onPlay}>
            {play.label}
          </button>
          {(built || lore) && (
            <button className="btn" onClick={handleRead}>
              READ
            </button>
          )}
        </div>
      </div>
      <dialog
        ref={ref}
        className="sheet"
        aria-label={`${c.name}: background and stat block`}
        onClose={() => setOpen(false)}
        onClick={handleBackdrop}
      >
        <div className="sb-title">
          <span>{c.name.toUpperCase()}</span>
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
        {open && (
          <div className="agent-read">
            {/* The story first: a new player picks an Agent by who they are, and the stat block means little yet. */}
            {lore && (
              <section className="stack" style={{ gap: 6 }} aria-label="Background">
                <div className="rule">
                  <span>BACKGROUND</span>
                </div>
                <DetailView detail={c.detail} />
              </section>
            )}
            {built && (
              <>
                <SheetGuide />
                <StatBlock me={c} d={deriveStats({ stats: s, overrides: c.overrides, tier })} tier={tier} />
                <Wargear me={c} />
              </>
            )}
            <button className="btn primary" disabled={play.busy} onClick={play.onPlay}>
              {play.label}
            </button>
          </div>
        )}
      </dialog>
    </article>
  );
}
