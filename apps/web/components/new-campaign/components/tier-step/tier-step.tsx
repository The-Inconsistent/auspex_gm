import { startingXp, TIERS } from "@wg/shared";

import { Help } from "@/components/ui/term/term";

type TierStepProps = { tier: number; onTier: (tier: number) => void };

// TIER (Core pp.19–20): the group's power level, and the XP every Agent starts with.
export function TierStep({ tier, onTier }: TierStepProps) {
  return (
    <>
      <div className="rule">
        <span>
          WHAT TIER WILL THE AGENTS PLAY AT?{" "}
          <Help title="Tier" cite="Core Rulebook pp.19–20">
            The group&apos;s power level, and the scale of what it faces: at Tier 1 threats to the local area (mutants,
            a Scum gang, a small cult), at Tier 3 threats to a whole planet. Every Agent builds with Tier × 100 XP. A
            group still in training can start lower, and leaders of organisations (Lord Inquisitors, Arch-Magi) play at
            Tier 5.
          </Help>
        </span>
      </div>
      <p className="dim">
        The Tier is the group&apos;s power level: higher Tiers face more perilous adventures and deadlier threats. Core
        Rulebook p.19
      </p>
      <fieldset className="bld-radios choices">
        <legend className="sr-only">Tier</legend>
        {TIERS.map((t) => (
          <label key={t} className="bld-opt choice">
            <input type="radio" name="tier" checked={tier === t} onChange={() => onTier(t)} />
            <span className="stack" style={{ gap: 2 }}>
              <b className="display">TIER {t}</b>
              <span className="dim">
                {startingXp(t)} XP each{t === 5 && " · leaders of organisations (p.20)"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="dim">Starting XP: Core Rulebook p.20. ASCEND in PARTY raises the Tier later.</p>
    </>
  );
}
