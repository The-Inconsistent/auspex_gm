"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CharacterBuild,
  catalogueOf,
  resolveBuild,
  type BuildChoice,
  type Character,
  type CharacterDetail,
  type CreationPayload,
  type LibraryEntry,
  type LiveState,
  type ResolvedBuild,
  type Role,
  type RuleEntry,
} from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
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
import { AUTOSAVE_MS, draftKey, libraryDraftKey, type BuilderStep } from "./constants";

// Where the builder works: a campaign's table, or the signed-in user's own library (issue #14). Everything the two
// differ in is here, so the builder itself is the same screen either way.
type Bench = {
  tier: number; // the Tier the character is made at
  tierEditable: boolean; // the library lets its owner pick; a campaign's Tier is the GM's, set in PARTY
  homebrew: boolean;
  setHomebrew: ((next: boolean) => Promise<string | null>) | null; // null: not this caller's to change
  role: Role;
  made: boolean; // saved from the builder before: creation is done, ADVANCE spends the XP earned
  play: { tier: number; xpEarned: number } | null;
  key: string; // where this device keeps the draft
  start: { name: string; detail?: Partial<CharacterDetail>; build?: unknown; draft?: Draft | null };
  save: (draft: Draft) => Promise<string | null>; // the error, or null once saved
  sendDraft: ((draft: Draft) => Promise<string | null>) | null;
  autosave: ((draft: Draft) => void) | null; // the library saves as you go; a table waits for SEND TO GM
  sentDraft: boolean;
  backHref: string;
  banner: string | null; // the strip along the top: no signal, or a draft that didn't save
};

type BuilderProps = {
  campaignId: string;
  characterId: string | null;
  role: Role;
  payload: CreationPayload;
  rules: RuleEntry[];
};

// The character builder at a table (issue #9 step 4): waits for the table, then works on a draft of the build.
export function Builder({ campaignId, characterId, role, payload, rules }: BuilderProps) {
  const router = useRouter();
  const { state, online, send } = useTable(campaignId);
  if (!state) return <StatusScreen text="SYNCING COGITATOR…" />;
  const character = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
  if (characterId && !character) return <StatusScreen text="CHARACTER NOT FOUND." />;
  return (
    <RulesProvider rules={rules}>
      <TableBench
        key={characterId ?? "new"}
        {...{ campaignId, characterId, role, payload, state, online, send, character, router }}
      />
    </RulesProvider>
  );
}

type TableBenchProps = Omit<BuilderProps, "rules"> & {
  state: LiveState;
  online: boolean;
  send: Send;
  character?: Character;
  router: ReturnType<typeof useRouter>;
};

// The table's bench: the campaign sets the Tier and the books, and saving goes through the socket actions.
function TableBench({
  campaignId,
  characterId,
  role,
  payload,
  state,
  online,
  send,
  character,
  router,
}: TableBenchProps) {
  const tier = state.campaign.tier;
  const xpEarned = character?.xp;
  const bench = useMemo(
    (): Bench => ({
      tier,
      tierEditable: false,
      homebrew: state.campaign.homebrew,
      // The GM decides whether the builder may use the homebrew books, for the whole campaign.
      setHomebrew:
        role === "gm"
          ? async (next) => {
              const r = await send({ type: "campaign.update", homebrew: next });
              return r.ok ? null : r.error;
            }
          : null,
      role,
      made: !!character?.build,
      play: xpEarned === undefined ? null : { tier, xpEarned },
      key: draftKey({ campaignId, characterId }),
      start: {
        name: character?.name ?? "",
        detail: character?.detail,
        build: character?.build,
        draft: character?.draft as Draft | null,
      },
      save: async (draft) => {
        const { name, detail, archetypeId, savedAt: _, ...rest } = draft;
        if (!archetypeId) return "Choose an archetype first";
        const r = await send({
          type: "character.build",
          id: characterId ?? undefined,
          name: name.trim() || undefined,
          detail,
          build: { ...rest, archetypeId },
        });
        return r.ok ? null : r.error;
      },
      // SEND TO GM: the draft waits on the character for the GM to tick and save.
      sendDraft: characterId
        ? async (draft) => {
            const r = await send({
              type: "character.draft",
              id: characterId,
              draft: { ...draft, savedAt: Date.now() },
            });
            return r.ok ? null : r.error;
          }
        : null,
      autosave: null,
      sentDraft: !!character?.draft,
      backHref: `/c/${campaignId}`,
      banner: online ? null : "NO SIGNAL · RECONNECTING",
    }),
    [tier, state.campaign.homebrew, role, character, xpEarned, campaignId, characterId, send, online],
  );
  return <Workshop bench={bench} payload={payload} onSaved={() => router.push(`/c/${campaignId}`)} />;
}

type LibraryBuilderProps = { entry: LibraryEntry; payload: CreationPayload; rules: RuleEntry[] };

// The same builder on a character nobody's table owns yet (issue #14): no socket, the owner picks the Tier and the
// books, and the draft saves itself to the library as they go.
export function LibraryBuilder({ entry, payload, rules }: LibraryBuilderProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const put = useCallback(
    async (body: unknown): Promise<string | null> => {
      try {
        const res = await fetch(`/api/library/${entry.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) return null;
        const message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
        return message ?? "The library didn't save that. Try again.";
      } catch {
        return "No signal. The draft is still on this device.";
      }
    },
    [entry.id],
  );

  // Saving as you go, debounced: identity stays stable across renders, so a save that fails can't set the banner and
  // schedule itself again.
  const autosave = useCallback(
    (draft: Draft) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const error = await put({ name: draft.name.trim(), detail: draft.detail, draft: { ...draft } });
        setBanner(error && `NOT SAVED · ${error.toUpperCase()}`);
      }, AUTOSAVE_MS);
    },
    [put],
  );

  const bench = useMemo(
    (): Bench => ({
      tier: entry.tier ?? entry.build?.tier ?? 1,
      tierEditable: true,
      homebrew: entry.homebrew,
      // Per character here: there's no campaign to decide, and the catalogue is served already filtered, so the page
      // reloads with the other books.
      setHomebrew: async (next) => {
        const error = await put({ homebrew: next });
        if (!error) router.refresh();
        return error;
      },
      role: "player", // no table, so no GM part: the GM's rulings and ticks belong to the campaign copy
      made: false, // a library character has earned no XP; advancement belongs to the campaign copy
      play: null,
      key: libraryDraftKey(entry.id),
      start: { name: entry.name, detail: entry.detail, build: entry.build, draft: entry.draft as Draft | null },
      save: async (draft) => {
        const { name, detail, archetypeId, savedAt: _, ...rest } = draft;
        if (!archetypeId) return "Choose an archetype first";
        return put({ name: name.trim(), detail, build: { ...rest, archetypeId }, draft: null });
      },
      sendDraft: null, // bring it into a campaign from that campaign's builder instead (issue #14 step 4)
      autosave,
      sentDraft: false,
      backHref: "/",
      banner,
    }),
    [entry, put, router, autosave, banner],
  );

  return (
    <RulesProvider rules={rules}>
      <Workshop bench={bench} payload={payload} onSaved={() => router.push("/")} />
    </RulesProvider>
  );
}

// A draft to start from: the newer of this device's and the one saved away from it (a player's on the table, or the
// library's), else the saved build, else a blank one.
function initialDraft({ key, start, tier }: { key: string; start: Bench["start"]; tier: number }): Draft {
  let local: Draft | null = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored) local = JSON.parse(stored) as Draft;
  } catch {
    // Storage blocked or a draft from an older builder: start from the saved draft or the saved build instead.
  }
  const newest = [local, start.draft ?? null]
    .filter((d): d is Draft => d !== null)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  // A draft from before the builder kept the detail starts from the character's.
  if (newest) return { detail: start.detail, ...newest };
  const saved = CharacterBuild.safeParse(start.build);
  if (saved.success) return { ...saved.data, name: start.name, detail: start.detail };
  return { tier, name: start.name, detail: start.detail };
}

type WorkshopProps = { bench: Bench; payload: CreationPayload; onSaved: () => void };

function Workshop({ bench, payload, onSaved }: WorkshopProps) {
  const { key, start, made, play, role } = bench;
  const [draft, setDraft] = useState<Draft>(() => initialDraft({ key, start, tier: bench.tier }));
  const locked = made && role !== "gm";
  const [step, setStep] = useState<BuilderStep>(locked ? "advance" : draft.archetypeId ? "customise" : "tier");
  const [error, setError] = useState<string | null>(null);
  // The Tier the build is made at: the campaign's, or the one the library's owner picked.
  const tier = bench.tierEditable ? draft.tier : bench.tier;

  const catalogue = useMemo(() => catalogueOf(payload), [payload]);
  const lookups = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(payload.creation).map(([k, list]) => [k, new Map(list.map((r) => [r.id, r]))]),
      ) as unknown as Lookups,
    [payload],
  );

  // The live sheet: every change re-resolves the whole build, so a later choice that breaks an earlier one shows up.
  // `tier` wins over the draft's, so a draft made before the GM changed the campaign's Tier resolves at the table's.
  const resolved = useMemo((): ResolvedBuild | null => {
    if (!draft.archetypeId) return null;
    const { name: _, detail: __, savedAt: ___, archetypeId, ...rest } = draft;
    try {
      return resolveBuild({ catalogue, build: { ...rest, tier, archetypeId }, play: play ?? undefined });
    } catch {
      return null; // a malformed draft (an older builder's): START OVER clears it
    }
  }, [draft, tier, catalogue, play]);

  // External systems: localStorage, so a half-made character survives a closed tab on this device, and the library,
  // which keeps the draft for the next device.
  const autosave = bench.autosave;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Storage blocked (private mode): the draft lives only in this tab.
    }
    autosave?.(draft);
  }, [key, draft, autosave]);

  const value = useMemo((): BuilderValue => {
    const update = (fn: (d: Draft) => Draft) => setDraft((d) => ({ ...fn(d), savedAt: Date.now() }));
    const setChoice = (path: string, answer: BuildChoice) =>
      setDraft((d) => ({ ...d, choices: { ...d.choices, [path]: answer }, savedAt: Date.now() }));
    const go = (s: BuilderStep) => {
      setStep(s);
      window.scrollTo({ top: 0 });
    };
    return {
      draft,
      update,
      setChoice,
      resolved,
      catalogue,
      lookups,
      tier,
      tierEditable: bench.tierEditable,
      setTier: (next: number) => update((d) => ({ ...d, tier: next })),
      homebrew: bench.homebrew,
      setHomebrew: bench.setHomebrew,
      play,
      made,
      role,
      go,
      sendDraft: bench.sendDraft ? () => bench.sendDraft!({ ...draft, savedAt: Date.now() }) : null,
      sentDraft: bench.sentDraft,
    };
  }, [draft, resolved, catalogue, lookups, tier, play, made, role, bench]);

  // START OVER: drops the draft on this device and goes back to the saved build, or a blank one.
  const startOver = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    setDraft(initialDraft({ key, start: { ...start, draft: null }, tier }));
    setStep("tier");
  };

  // SAVE: the server re-resolves the build and writes the sheet; away from the builder once it's saved.
  const save = async () => {
    const failure = await bench.save({ ...draft, tier });
    if (failure) return setError(failure);
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    onSaved();
  };

  return (
    <BuilderContext.Provider value={value}>
      <div className="bld">
        {bench.banner && <div className="badge-offline">{bench.banner}</div>}
        <header className="band torn bld-head">
          <a href={bench.backHref} aria-label="Back" className="display" style={{ fontSize: 30 }}>
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
            {step === "tier" && <TierStep />}
            {step === "archetype" && <ArchetypeStep />}
            {step === "customise" && <CustomiseStep />}
            {step === "faction" && <FactionStep />}
            {step === "ascension" && <AscensionStep />}
            {step === "detail" && <DetailStep />}
            {step === "advance" && <CustomiseStep layer="advancement" />}
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
