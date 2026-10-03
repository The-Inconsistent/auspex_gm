import { startingXp, TIERS } from "@wg/shared";

type TierStepProps = { tier: number; onTier: (tier: number) => void };

// TIER (Core pp.19–20): the group's power level, and the XP every Agent starts with.
export function TierStep({ tier, onTier }: TierStepProps) {
  return (
    <>
      <div className="rule">WHAT TIER WILL THE AGENTS PLAY AT?</div>
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
