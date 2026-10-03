"use client";

import { scaleBy, THREAT_PROFILES, threatClassAt, type ProfileId, type Threat } from "@wg/shared";

import { PROFILE_CHIP } from "./constants";

type ThreatScaleProps = {
  threat?: Threat; // the picked stat block; without one the controls wait, since the preview needs its class
  tier: number;
  agents: number;
  asMob?: boolean;
  profiles: readonly ProfileId[];
  scale: boolean;
  onChange: (next: { profiles: ProfileId[]; scale: boolean }) => void;
};

// The Tier 5 Threat Profiles (VoA p.126) and Scaling Threats (Core p.326) as the GM ticks them, on a prepared entry
// and on + THREAT. The chips are short because the row is tight on a tablet; each one's full name, cite and effect sit
// in its title. SCALE shows what it would add, and says why when it would add nothing (a Troop or a Mob, rules-flow
// §11.107).
export function ThreatScale({ threat, tier, agents, asMob = false, profiles, scale, onChange }: ThreatScaleProps) {
  const toggle = (id: ProfileId) =>
    onChange({ profiles: profiles.includes(id) ? profiles.filter((p) => p !== id) : [...profiles, id], scale });
  const by = threat ? scaleBy(threat, { tier, agents, asMob }) : 0;
  const cls = threat ? threatClassAt(threat, tier) : null;
  const why = !threat
    ? "Pick a threat first"
    : asMob
      ? "A Mob's members have 1 Wound each (Core p.325)"
      : cls === "T"
        ? "Troops stay as simple as possible (Core p.326)"
        : "";

  return (
    <div className="keys" role="group" aria-label="Threat profiles and scaling">
      {THREAT_PROFILES.map((p) => (
        <button
          key={p.id}
          className={`btn sm ${profiles.includes(p.id) ? "primary" : ""}`}
          aria-pressed={profiles.includes(p.id)}
          title={`${p.name} (${p.cite}): ${p.effect}`}
          onClick={() => toggle(p.id)}
        >
          {PROFILE_CHIP[p.id]}
        </button>
      ))}
      {/* The toggle always shows what the entry holds, and stays tappable so a ticked SCALE can be cleared. Ticking
          MOB on a scaled Adversary, or a Tier that makes it a Troop, adds nothing now - but the tick is still there,
          and would come back with the Mob off, so hiding it would be lying about the entry. */}
      <button
        className={`btn sm ${scale ? "primary" : ""}`}
        aria-pressed={scale}
        disabled={!threat}
        title={
          threat
            ? `Core p.326: ${by > 0 ? `+${by} Wounds and Shock (${cls === "E" ? `Tier ${tier}` : `${agents} Agents + Tier ${tier}`})` : `adds nothing here. ${why}`}`
            : why
        }
        onClick={() => onChange({ profiles: [...profiles], scale: !scale })}
      >
        {scale && by === 0 ? "SCALE ±0" : by > 0 ? `SCALE +${by}` : "SCALE"}
      </button>
      {why && <span className="dim">{scale && by === 0 ? `Ticked, but ${why.toLowerCase()}` : why}</span>}
    </div>
  );
}
