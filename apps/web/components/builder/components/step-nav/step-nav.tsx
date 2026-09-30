"use client";
import { useBuilder } from "../../builder-context";
import { STEP_LABELS, type BuilderStep } from "../../constants";
import { leftIn, stepsFor } from "../../utils";

type StepNavProps = { step: BuilderStep };

// One tab per screen, each saying how much is left there in words ("2 LEFT"), not colour alone.
export function StepNav({ step }: StepNavProps) {
  const { draft, lookups, tier, resolved, go, made, role, ascending } = useBuilder();
  const steps = stepsFor({ draft, lookups, tier, made, locked: made && role !== "gm", ascending });
  return (
    <nav className="bld-steps" aria-label="Creation steps">
      <div className="tabs sub" role="tablist">
        {steps.map((s, i) => {
          const left = s === "review" || s === "tier" ? 0 : leftIn(resolved, s);
          return (
            <button key={s} role="tab" className="tab" aria-selected={step === s} onClick={() => go(s)}>
              {i + 1} {STEP_LABELS[s]}
              {left > 0 && <span className="bld-left"> · {left} LEFT</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
