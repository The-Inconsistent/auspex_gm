"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  CharacterBuild,
  catalogueOf,
  resolveBuild,
  type BuildChoice,
  type Character,
  type CreationPayload,
  type LiveState,
  type ResolvedBuild,
  type Role,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { useTable, type Send } from "@/hooks/use-table/use-table";

import { BuilderContext, type BuilderValue, type Draft, type Lookups } from "./builder-context";
import { ArchetypeStep } from "./components/archetype-step/archetype-step";
import { AscensionStep } from "./components/ascension-step/ascension-step";
import { CustomiseStep } from "./components/customise-step/customise-step";
import { DetailStep } from "./components/detail-step/detail-step";
import { FactionStep } from "./components/faction-step/faction-step";
import { ReviewStep } from "./components/review-step/review-step";
import { StepNav } from "./components/step-nav/step-nav";
import { TierStep } from "./components/tier-step/tier-step";
import { XpBar } from "./components/xp-bar/xp-bar";
import { XpLedger } from "./components/xp-ledger/xp-ledger";
import { draftKey, type BuilderStep } from "./constants";

type BuilderProps = { campaignId: string; characterId: string | null; role: Role; payload: CreationPayload };

// The character builder (issue #9 step 4): waits for the table, then works on a draft of the build.
export function Builder({ campaignId, characterId, role, payload }: BuilderProps) {
  const { state, online, send } = useTable(campaignId);
  if (!state) return <StatusScreen text="SYNCING COGITATOR…" />;
  const character = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
  if (characterId && !character) return <StatusScreen text="CHARACTER NOT FOUND." />;
  return (
    <Workshop
      key={characterId ?? "new"}
      {...{ campaignId, characterId, role, payload, state, online, send, character }}
    />
  );
}

type WorkshopProps = BuilderProps & { state: LiveState; online: boolean; send: Send; character?: Character };

// A draft to start from: the newer of this device's and the one sent to the table (a player's, for the GM to tick),
// else the character's saved build, else a blank one.
function initialDraft({ key, character, tier }: { key: string; character?: Character; tier: number }): Draft {
  let local: Draft | null = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored) local = JSON.parse(stored) as Draft;
  } catch {
    // Storage blocked or a draft from an older builder: start from the table's draft or the saved build instead.
  }
  const sent = (character?.draft ?? null) as Draft | null;
  const newest = [local, sent]
    .filter((d): d is Draft => d !== null)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  if (newest) return newest;
  const saved = CharacterBuild.safeParse(character?.build);
  if (saved.success) return { ...saved.data, name: character?.name ?? "" };
  return { tier, name: character?.name ?? "" };
}

function Workshop({ campaignId, characterId, role, payload, state, online, send, character }: WorkshopProps) {
  const router = useRouter();
  const tier = state.campaign.tier;
  const key = draftKey({ campaignId, characterId });
  const [draft, setDraft] = useState<Draft>(() => initialDraft({ key, character, tier }));
  const [step, setStep] = useState<BuilderStep>(draft.archetypeId ? "customise" : "tier");
  const [error, setError] = useState<string | null>(null);

  const catalogue = useMemo(() => catalogueOf(payload), [payload]);
  const lookups = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(payload.creation).map(([k, list]) => [k, new Map(list.map((r) => [r.id, r]))]),
      ) as unknown as Lookups,
    [payload],
  );

  // The live sheet: every change re-resolves the whole build, so a later choice that breaks an earlier one shows up.
  const resolved = useMemo((): ResolvedBuild | null => {
    if (!draft.archetypeId) return null;
    const { name: _, savedAt: __, archetypeId, ...rest } = draft;
    try {
      return resolveBuild({ catalogue, build: { ...rest, archetypeId, tier } });
    } catch {
      return null; // a malformed draft (an older builder's): START OVER clears it
    }
  }, [draft, catalogue, tier]);

  // External system: localStorage, so a half-made character survives a closed tab on this device.
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Storage blocked (private mode): the draft lives only in this tab.
    }
  }, [key, draft]);

  const value = useMemo((): BuilderValue => {
    const update = (fn: (d: Draft) => Draft) => setDraft((d) => ({ ...fn(d), savedAt: Date.now() }));
    const setChoice = (path: string, answer: BuildChoice) =>
      setDraft((d) => ({ ...d, choices: { ...d.choices, [path]: answer }, savedAt: Date.now() }));
    const go = (s: BuilderStep) => {
      setStep(s);
      window.scrollTo({ top: 0 });
    };
    const sendDraft = characterId
      ? async () => {
          const r = await send({ type: "character.draft", id: characterId, draft: { ...draft, savedAt: Date.now() } });
          return r.ok ? null : r.error;
        }
      : null;
    return {
      draft,
      update,
      setChoice,
      resolved,
      catalogue,
      lookups,
      tier,
      role,
      go,
      sendDraft,
      sentDraft: !!character?.draft,
    };
  }, [draft, resolved, catalogue, lookups, tier, role, characterId, send, character?.draft]);

  // START OVER: drops the draft on this device and goes back to the saved build, or a blank one.
  const startOver = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    setDraft(initialDraft({ key, character, tier }));
    setStep("tier");
  };

  // SAVE: the server re-resolves the build and writes the sheet; back to the table once it's saved.
  const save = async () => {
    if (!draft.archetypeId) return;
    const { name, archetypeId, savedAt: _, ...rest } = draft;
    const r = await send({
      type: "character.build",
      id: characterId ?? undefined,
      name: name.trim() || undefined,
      build: { ...rest, archetypeId, tier },
    });
    if (!r.ok) return setError(r.error);
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    router.push(`/c/${campaignId}`);
  };

  return (
    <BuilderContext.Provider value={value}>
      <div className="bld">
        {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
        <header className="band torn bld-head">
          <a href={`/c/${campaignId}`} aria-label="Back to the table" className="display" style={{ fontSize: 30 }}>
            ◂
          </a>
          <div className="display gm-title">
            {draft.name.trim() ? draft.name.toUpperCase() : "NEW CHARACTER"}
            <span className="dim"> · BUILDER · T{tier}</span>
          </div>
          <button className="btn sm" onClick={startOver}>
            START OVER
          </button>
          <ThemeToggle />
        </header>
        <StepNav step={step} />
        <div className="bld-shell">
          <main className="bld-main">
            {step === "tier" && <TierStep homebrew={state.campaign.homebrew} send={send} />}
            {step === "archetype" && <ArchetypeStep />}
            {step === "customise" && <CustomiseStep />}
            {step === "faction" && <FactionStep />}
            {step === "ascension" && <AscensionStep />}
            {step === "detail" && <DetailStep />}
            {step === "review" && <ReviewStep onSave={save} />}
          </main>
          <aside className="bld-side" aria-label="XP ledger and what is left">
            <XpLedger />
          </aside>
        </div>
        <XpBar />
        <Refusal error={error} onDismiss={() => setError(null)} />
      </div>
    </BuilderContext.Provider>
  );
}
