"use client";
import { effectiveStrength, type Character, type DerivedStats } from "@wg/shared";

import { SheetGuide } from "@/components/ui/sheet-guide/sheet-guide";
import { Term } from "@/components/ui/term/term";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import { topSkills, weaponPool, weaponSkill } from "@/lib/sheet-pools/sheet-pools";

import { GLANCE_SKILLS, TRAIT_CELLS, WEAPON_SKILL_TAGS } from "../../constants";
import { Heading } from "../heading/heading";

type GlanceProps = { me: Character; d: DerivedStats; onAllSkills: () => void };

// AT A GLANCE: what a fight asks for on one screen: the Traits row, the weapons with their pools, the best Skills.
// Armour, Talents and the rest are in the DOSSIER.
export function Glance({ me, d, onAllSkills }: GlanceProps) {
  const s = me.stats;
  const armour = s.armour.name ? `Resilience counts the ${s.armour.name}, AR ${s.armour.ar}. ` : "";
  return (
    <>
      <SheetGuide />
      <section className="ps-section" aria-label="Traits">
        <div className="ps-stat">
          {TRAIT_CELLS.map((t) => (
            <div key={t.label} className="ps-stat-cell">
              <Term k={t.key}>
                <span className="ps-stat-h">{t.label}</span>
                <span className="ps-stat-v mono">{d[t.key]}</span>
              </Term>
            </div>
          ))}
        </div>
        <span className="ps-note">{armour}Tap a Trait for what it means.</span>
      </section>

      {s.weapons.length > 0 && (
        <section className="ps-section">
          <Heading title="ARMAMENT" />
          <span className="ps-note">
            Each line reads <Term k="damage">damage</Term> + <Term k="ed">ED</Term> · <Term k="ap">AP</Term> · R for{" "}
            <Term k="range">Range</Term> · S for <Term k="salvo">Salvo</Term>, then its traits.
          </span>
          {s.weapons.map((w) => (
            <div key={w.name} className="ps-weapon cut">
              {/* the pool the attack rolls: Skill + Attribute, mutations counted */}
              <Term k={weaponSkill(w) === "Weapon Skill" ? "weaponSkill" : "ballisticSkill"}>
                <span className="pool-badge" role="img" aria-label={`${weaponSkill(w)} pool ${weaponPool(s, w)}`}>
                  <small>{WEAPON_SKILL_TAGS[weaponSkill(w)]}</small>
                  {weaponPool(s, w)}
                </span>
              </Term>
              <div className="ps-weapon-text">
                <b className="ps-weapon-name">{w.name}</b>
                <span className="ps-weapon-line">
                  <WeaponLine weapon={w} strength={effectiveStrength(s)} />
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="ps-section">
        <Heading
          title="YOUR SKILLS"
          aside={
            <span className="label">
              <Term k="dice">DICE</Term>
            </span>
          }
        />
        {topSkills(s, GLANCE_SKILLS).map((r) => (
          <div key={r.skill} className="ps-skill">
            <span className={r.trained ? "pool-badge" : "pool-badge hollow"}>{r.total}</span>
            <span className="ps-skill-name">{r.skill}</span>
            <span className="ps-attr mono">{r.attribute}</span>
          </div>
        ))}
        <button type="button" className="ps-more" onClick={onAllSkills}>
          ALL 18 SKILLS IN THE DOSSIER ›
        </button>
      </section>
    </>
  );
}
