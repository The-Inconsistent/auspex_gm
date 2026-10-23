"use client";
import {
  ATTRIBUTES,
  ATTRIBUTE_NAMES,
  SKILLS,
  effectiveStrength,
  rankOf,
  withMutations,
  type Character,
  type DerivedStats,
  type Skill,
} from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { Pop, Term } from "@/components/ui/term/term";
import { ATTRIBUTE_TERMS, SKILL_TERMS } from "@/lib/sheet-terms/sheet-terms";

type StatBlockProps = {
  me: Character;
  d: DerivedStats;
  tier: number;
  // The SKILLS, ABILITIES and TALENTS rows. The DOSSIER leaves them out: its DICE TO ROLL and TALENTS & ABILITIES
  // sections below already hold them, with more.
  lists?: boolean;
};

// What an Ability or Talent says, or why it can't be read here: the invite preview strips the text for a guest.
const NO_TEXT = "Its full text shows once you sign in or take a seat.";

// The Agent as the book prints an Archetype's stat block (Core p.117): the name bar and the Tier strip, then labelled
// rows on alternating bands, ordered for a new player: what you are made of (Attributes, then Influence), what you are
// (Archetype), what you can do (Skills, Abilities, Talents), and who you belong to (Keywords) last. Every label, and
// every Attribute by its full name, opens its meaning. Wargear is its own section below (Wargear). Read-only.
export function StatBlock({ me, d, tier, lists = true }: StatBlockProps) {
  const s = me.stats;
  const shown = withMutations(s); // Attributes and Skills as the mutations change them (Core pp.288–295)
  const trained = (Object.keys(SKILLS) as Skill[]).filter((k) => (shown.skills[k] ?? 0) > 0);
  // Abilities and Talents are cited as the build wrote them. Nothing on the sheet marks which ability is the Archetype's.
  const rules = [
    ["abilities", "ABILITIES", s.abilities],
    ["talents", "TALENTS", s.talents],
  ] as const;

  return (
    <section id="ps-attr" className="ps-block" aria-label="Stat block">
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
      <div className="ps-rows">
        <div className="ps-brow">
          <b>
            <Term k="attributes">ATTRIBUTES</Term>:
          </b>
          <span className="ps-attrs">
            {ATTRIBUTES.map((a) => (
              <span key={a}>
                <Term k={ATTRIBUTE_TERMS[a]}>{ATTRIBUTE_NAMES[a]}</Term> <b className="mono">{shown.attributes[a]}</b>
              </span>
            ))}
          </span>
          {s.armour.powered > 0 && (
            <i className="ps-cite">
              Strength {effectiveStrength(s)} in Powered ({s.armour.powered}) armour.
            </i>
          )}
        </div>
        <div className="ps-brow">
          <b>
            <Term k="influence">INFLUENCE</Term>:
          </b>{" "}
          <span className="mono">{d.influence}</span>
        </div>
        <div className="ps-brow">
          <b>
            <Term k="archetype">ARCHETYPE</Term>:
          </b>{" "}
          {s.archetype || "None"}, <Term k="rank">Rank</Term> {rankOf(me.xp)}
        </div>
        {lists && trained.length > 0 && (
          <div className="ps-brow">
            <b>
              <Term k="skills">SKILLS</Term>:
            </b>{" "}
            {trained.map((k, i) => (
              <span key={k}>
                {i > 0 && ", "}
                <Term k={SKILL_TERMS[k]}>{k}</Term> {shown.skills[k]}
              </span>
            ))}
          </div>
        )}
        {rules.map(
          ([term, title, list]) =>
            lists &&
            list.length > 0 && (
              <div key={title} className="ps-brow">
                <b>
                  <Term k={term}>{title}</Term>:
                </b>{" "}
                {list.map((r, i) => (
                  <span key={`${r.name}-${i}`}>
                    {i > 0 && ", "}
                    <Pop title={r.name} cite={r.page ?? ""} body={r.text || NO_TEXT}>
                      {r.name}
                    </Pop>
                    {r.page && (
                      <i className="ps-cite">
                        {" "}
                        <PageCite cite={r.page} />
                      </i>
                    )}
                  </span>
                ))}
              </div>
            ),
        )}
        {s.keywords.length > 0 && (
          <div className="ps-brow">
            <b>
              <Term k="keywords">KEYWORDS</Term>:
            </b>{" "}
            <span className="ps-kw">{s.keywords.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="ps-spikes ps-spikes-dn" aria-hidden="true" />
    </section>
  );
}
