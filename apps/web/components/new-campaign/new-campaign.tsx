"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { CreateGame, type FrameworkCatalogue } from "@wg/shared";

import { TableTalk } from "@/components/ui/table-talk/table-talk";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { STEP_LABELS } from "@/components/ui/wizard-steps/constants";
import { WizardSteps } from "@/components/ui/wizard-steps/wizard-steps";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";

import { NameStep } from "./components/name-step/name-step";
import { PremiseStep } from "./components/premise-step/premise-step";
import { TierStep } from "./components/tier-step/tier-step";
import { BEFORE_CREATE, CREATE_FORM, NEW_DRAFT, type Draft, type NewStep } from "./constants";

type NewCampaignProps = { catalogue: FrameworkCatalogue };

const isNewStep = (s: string): s is NewStep => BEFORE_CREATE.some((n) => n === s);

// CREATE NEW CAMPAIGN (the lobby): Tier, premise, the table's limits and a name, held here and sent in one POST, so
// leaving half-way leaves no empty campaign behind. Everything after TIER may be skipped; the SETUP tab lists what's left.
export function NewCampaign({ catalogue }: NewCampaignProps) {
  const router = useRouter();
  const [step, setStep] = useState<NewStep>("tier");
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldErrors("nc-");
  // CREATE pulses (aria-busy) from the tap until the campaign is up, and a second tap is ignored meanwhile.
  const [pending, startTransition] = useTransition();
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const at = BEFORE_CREATE.indexOf(step);
  const back = BEFORE_CREATE[at - 1];
  const next = BEFORE_CREATE[at + 1];

  const go = (s: NewStep) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  // CREATE NEW CAMPAIGN: you as GM, with everything the steps asked; then on to SETTING inside it (/c/<id>/setup).
  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const game = fields.check(CreateGame, { ...draft, name: draft.name.trim() });
    if (!game) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(game),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { campaignId?: string; message?: string } | null;
      if (!res?.ok || !body?.campaignId) return setError(body?.message ?? "No signal");
      // After an await the router call is outside the transition, so it's wrapped again to keep the pulse until it lands.
      startTransition(() => router.replace(`/c/${body.campaignId}/setup`));
    });
  };

  return (
    <div className="bld">
      <header className="band torn bld-head">
        <Link href="/" aria-label="Back to the lobby" className="display" style={{ fontSize: 30 }}>
          ◂
        </Link>
        <div className="display gm-title">
          {draft.name.trim() ? draft.name.toUpperCase() : "NEW CAMPAIGN"}
          <span className="dim"> · T{draft.tier}</span>
        </div>
        <ThemeToggle />
      </header>
      <WizardSteps step={step} here={BEFORE_CREATE} onStep={(s) => isNewStep(s) && go(s)} />
      <main className="bld-main" style={{ margin: "0 auto" }}>
        {step === "tier" && <TierStep tier={draft.tier} onTier={(tier) => patch({ tier })} />}
        {step === "premise" && (
          <PremiseStep
            catalogue={catalogue}
            tier={draft.tier}
            framework={draft.framework}
            frameworkBonus={draft.frameworkBonus}
            patron={draft.patron}
            onChange={patch}
          />
        )}
        {step === "table" && (
          <>
            <div className="rule">WHAT KIND OF GAME, AND WHAT TO LEAVE OUT?</div>
            <p className="dim">
              Ask the whole table, and respect every answer: nobody has to explain what they want left out. Core
              Rulebook p.316
            </p>
            <TableTalk kind={draft.kind} limits={draft.limits} onChange={patch} />
            <p className="dim">Players see both under MISSION, so the table remembers.</p>
          </>
        )}
        {step === "name" && (
          <NameStep
            draft={draft}
            error={error}
            fields={fields}
            onName={(name) => patch({ name })}
            onEdit={go}
            onCreate={handleCreate}
          />
        )}
        <div className="keys" style={{ justifyContent: "space-between" }}>
          {back ? (
            <button className="btn" onClick={() => go(back)}>
              ◂ BACK
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="btn primary" onClick={() => go(next)}>
              NEXT: {STEP_LABELS[next]} ▸
            </button>
          ) : (
            <button className="btn primary" form={CREATE_FORM} aria-busy={pending}>
              CREATE NEW CAMPAIGN
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
