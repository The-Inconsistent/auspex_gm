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

type StatBlockProps = { me: Character; d: DerivedStats; tier: number };

// The Agent as the book prints an Archetype's stat block (Core p.117): the name bar, the Tier strip, labelled rows on
// alternating bands, then the Attribute table. Read-only, and the first thing in the DOSSIER.
export function StatBlock({ me, d, tier }: StatBlockProps) {
  const s = me.stats;
  const shown = withMutations(s); // Attributes and Skills as the mutations change them (Core pp.288–295)
  const trained = (Object.keys(SKILLS) as Skill[]).filter((k) => (shown.skills[k] ?? 0) > 0);
  const wargear = [...s.weapons.map((w) => w.name), ...(s.armour.name ? [s.armour.name] : []), ...s.gear];
  // Abilities and Talents are cited as the build wrote them. Nothing on the sheet marks which ability is the Archetype's.
  const rules = [
    ["ABILITIES", s.abilities],
    ["TALENTS", s.talents],
  ] as const;

  return (
    <section id="ps-attr" className="ps-block" aria-label="Stat block">
      <div className="ps-spikes" aria-hidden="true" />
      <div className="ps-btitle">{me.name.toUpperCase()}</div>
      <div className="ps-bmeta">
        <b>TIER</b>
        <span className="mono">{tier}</span>
        <b>SPECIES</b>
        <span>{s.species}</span>
        <b>XP</b>
        <span className="mono">{me.xp}</span>
      </div>
      <div className="ps-rows">
        {s.keywords.length > 0 && (
          <div className="ps-brow">
            <b>KEYWORDS:</b> <span className="ps-kw">{s.keywords.join(", ")}</span>
          </div>
        )}
        <div className="ps-brow">
          <b>ARCHETYPE:</b> {s.archetype || "None"}, Rank {rankOf(me.xp)}
        </div>
        <div className="ps-brow">
          <b>ATTRIBUTES:</b> {ATTRIBUTES.map((a) => `${ATTRIBUTE_NAMES[a]} ${shown.attributes[a]}`).join(", ")}
        </div>
        {trained.length > 0 && (
          <div className="ps-brow">
            <b>SKILLS:</b> {trained.map((k) => `${k} ${shown.skills[k]}`).join(", ")}
          </div>
        )}
        {rules.map(
          ([title, list]) =>
            list.length > 0 && (
              <div key={title} className="ps-brow">
                <b>{title}:</b>{" "}
                {list.map((r, i) => (
                  <span key={r.name}>
                    {i > 0 && ", "}
                    {r.name}
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
        {wargear.length > 0 && (
          <div className="ps-brow">
            <b>WARGEAR:</b> {wargear.join(", ")}
          </div>
        )}
        <div className="ps-brow">
          <b>INFLUENCE:</b> <span className="mono">{d.influence}</span>
        </div>
      </div>
      <div className="ps-bbar">
        <span>ATTRIBUTES</span>
        {s.armour.powered > 0 && (
          <span className="mono ps-bbar-note">
            S {effectiveStrength(s)} IN POWERED ({s.armour.powered})
          </span>
        )}
      </div>
      <div className="ps-tbl">
        <span className="ps-tbl-h">ATTRIBUTE</span>
        {ATTRIBUTES.map((a) => (
          <b key={a}>{a}</b>
        ))}
        <span className="ps-tbl-h">RATING</span>
        {ATTRIBUTES.map((a) => (
          <span key={a} className="mono">
            {shown.attributes[a]}
          </span>
        ))}
      </div>
      <div className="ps-spikes ps-spikes-dn" aria-hidden="true" />
    </section>
  );
}
