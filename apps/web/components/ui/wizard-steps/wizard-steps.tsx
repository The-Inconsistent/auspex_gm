import { STEP_LABELS, WIZARD_STEPS, type WizardStep } from "./constants";

type WizardStepsProps = { step: WizardStep; here: readonly WizardStep[]; onStep: (step: WizardStep) => void };

// NEW CAMPAIGN's steps as one strip on both of its pages (the builder's, step-nav.tsx). Only this page's steps are
// tappable: the ones before them are done (✓; PARTY edits them later), the ones after wait for CREATE.
export function WizardSteps({ step, here, onStep }: WizardStepsProps) {
  const first = WIZARD_STEPS.findIndex((s) => here.includes(s));
  return (
    <nav className="bld-steps" aria-label="New campaign steps">
      <div className="tabs sub" role="tablist">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s}
            role="tab"
            className="tab"
            aria-selected={step === s}
            disabled={!here.includes(s)}
            onClick={() => onStep(s)}
          >
            {i + 1} {STEP_LABELS[s]}
            {i < first && " ✓"}
          </button>
        ))}
      </div>
    </nav>
  );
}
