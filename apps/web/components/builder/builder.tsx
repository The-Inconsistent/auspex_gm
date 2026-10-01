"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  catalogueOf,
  resolveBuild,
  withUpgrades,
  withWeaponEffects,
  type BuildChoice,
  type Character,
  type CharacterStats,
  type CreationPayload,
  type LibraryEntry,
  type LiveState,
  type Overrides,
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
import { draftOf, mergeOverrides, pickDraft, type DraftStart } from "./utils";

// The GM's overrides as the builder opened on them and as they are now; `mergeOverrides` saves only the difference.
type OverrideEdit = { base: Overrides; edited: Overrides };

// Where the builder works: a campaign's table, or the signed-in user's own library (issue #14). Everything the two
// differ in is here, so the builder itself is the same screen either way.
type Bench = {
  tier: number; // the Tier a character made here starts at: the campaign's now, or the library row's
  tierEditable: boolean; // the library lets its owner pick; a campaign's Tier is the GM's, set in PARTY
  homebrew: boolean;
  setHomebrew: ((next: boolean) => Promise<string | null>) | null; // null: not this caller's to change
  role: Role;
  made: boolean; // saved from the builder before: creation is done, ADVANCE spends the XP earned
  play: { tier: number; xpEarned: number; xpAtAscension?: number; packageWaived?: boolean } | null;
  key: string; // where this device keeps the draft
  // `savedAt` (ms) is when the build was last saved away from this device; it decides a stale local draft. At a table
  // the GM's tablet, the player's phone or a script (attach-builds.ts) may save it, so it's the character's `builtAt`.
  start: DraftStart;
  // What a new draft here records as the save it was opened on (`Draft.builtAt`): a table's `builtAt`, 0 before any;
  // undefined in the library, whose drafts compare times.
  stamp: number | undefined;
  overrides: Overrides | null; // the GM's overrides on the character; null where there are none to set (the library)
  sheet: CharacterStats | null; // the live sheet, for the overrides' derived values before a build resolves
  save: (draft: Draft, overrides: OverrideEdit | null) => Promise<string | null>; // the error, or null once saved
  // SAVE DETAILS ONLY (the GM, on a character that exists): name, detail and overrides, without a build, so a hand-made
  // sheet is still the GM's to rename and rule on (issue #18). null where there's no such character or no GM.
  saveDetails: ((draft: Draft, overrides: OverrideEdit | null) => Promise<string | null>) | null;
  sendDraft: ((draft: Draft) => Promise<string | null>) | null;
  autosave: ((draft: Draft) => void) | null; // the library saves as you go; a table waits for SEND TO GM
  cancelAutosave: (() => void) | null; // drops a debounced save that a finished build has overtaken
  canImport: boolean; // a table takes a copy from the caller's library; the library itself has nowhere to import from
  gmLater: boolean; // no GM here: what only a GM judges waits for the campaign's GM after the import (rules-flow §11.59)
  sentDraft: boolean;
  backHref: string;
  backLabel: string; // an icon-only control names its target, not just the action
  banner: string | null; // the strip along the top: no signal, or a draft that didn't save
};

type BuilderProps = {
  campaignId: string;
  characterId: string | null;
  role: Role;
  payload: CreationPayload;
  rules: RuleEntry[];
  initialStep?: BuilderStep; // the screen "?step=" asked for, read by the page on the server
};

// The character builder at a table (issue #9 step 4): waits for the table, then works on a draft of the build.
export function Builder({ campaignId, characterId, role, payload, rules, initialStep }: BuilderProps) {
  const router = useRouter();
  const { state, online, send } = useTable(campaignId);
  if (!state) return <StatusScreen text="SYNCING COGITATOR…" />;
  const character = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
  if (characterId && !character) return <StatusScreen text="CHARACTER NOT FOUND." />;
  return (
    <RulesProvider rules={rules}>
      <TableBench
        initialStep={initialStep}
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
  initialStep,
}: TableBenchProps) {
  const tier = state.campaign.tier;
  const xpEarned = character?.xp;
  // A new character's id once its build saved, so a retry after a failed overrides save updates it, not a second one.
  const created = useRef<string | null>(null);
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
      // In play the Ascension fields ride along: `xpAtAscension` is what the XP stood at when the group last Ascended
      // (PARTY's ASCEND panel uses the same), and a waived package is the GM's (Core p.148 step 2).
      play:
        xpEarned === undefined
          ? null
          : {
              tier,
              xpEarned,
              xpAtAscension: character?.xpAtAscension,
              packageWaived: character?.ascensionPackageWaived,
            },
      key: draftKey({ campaignId, characterId }),
      start: {
        name: character?.name ?? "",
        detail: character?.detail,
        build: character?.build,
        draft: draftOf(character?.draft),
        savedAt: character?.builtAt ?? undefined,
      },
      stamp: character?.builtAt ?? 0,
      overrides: character?.overrides ?? {},
      sheet: character?.stats ?? null,
      // The build, then the GM's overrides when they changed: they're on the character, not in the build.
      save: async (draft, edit) => {
        const { name, detail, archetypeId, savedAt: _, builtAt: __, ...rest } = draft;
        if (!archetypeId) return "Choose an archetype first";
        const r = await send({
          type: "character.build",
          id: characterId ?? created.current ?? undefined,
          name: name.trim() || undefined,
          detail,
          build: { ...rest, archetypeId },
        });
        if (!r.ok) return r.error;
        if (r.id) created.current = r.id;
        const id = r.id ?? characterId;
        const overrides = edit && mergeOverrides({ live: character?.overrides ?? {}, ...edit });
        if (role !== "gm" || !id || !overrides) return null;
        const u = await send({ type: "character.update", id, overrides });
        return u.ok ? null : u.error;
      },
      saveDetails:
        role === "gm" && characterId
          ? async (draft, edit) => {
              const name = draft.name.trim();
              if (!name) return "A character needs a name";
              const overrides = edit && mergeOverrides({ live: character?.overrides ?? {}, ...edit });
              const r = await send({
                type: "character.update",
                id: characterId,
                name,
                detail: draft.detail,
                ...(overrides && { overrides }),
              });
              return r.ok ? null : r.error;
            }
          : null,
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
      cancelAutosave: null,
      canImport: true, // a seat at a table can take a copy from the caller's own library (issue #14 step 4)
      gmLater: false, // the table's GM is here to tick
      sentDraft: !!character?.draft,
      backHref: `/c/${campaignId}`,
      backLabel: "Back to the table",
      banner: online ? null : "NO SIGNAL · RECONNECTING",
    }),
    [tier, state.campaign.homebrew, role, character, xpEarned, campaignId, characterId, send, online],
  );
  return (
    <Workshop
      bench={bench}
      payload={payload}
      initialStep={initialStep}
      onSaved={() => router.push(`/c/${campaignId}`)}
    />
  );
}

type LibraryBuilderProps = { entry: LibraryEntry; payload: CreationPayload; rules: RuleEntry[] };

// The same builder on a character nobody's table owns yet (issue #14): no socket, the owner picks the Tier and the
// books, and the draft saves itself to the library as they go.
export function LibraryBuilder({ entry, payload, rules }: LibraryBuilderProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // External system: the debounce timer, dropped when the builder closes so a save can't fire into an unmounted page.
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
        const reply = (await res.json().catch(() => null)) as { message?: unknown } | null;
        return typeof reply?.message === "string" ? reply.message : "The library didn't save that. Try again.";
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
      start: {
        name: entry.name,
        detail: entry.detail,
        build: entry.build,
        draft: draftOf(entry.draft),
        savedAt: Date.parse(entry.updatedAt) || undefined,
      },
      stamp: undefined,
      overrides: null, // no GM here
      sheet: null,
      save: async (draft) => {
        const { name, detail, archetypeId, savedAt: _, builtAt: __, ...rest } = draft;
        if (!archetypeId) return "Choose an archetype first";
        return put({ name: name.trim(), detail, build: { ...rest, archetypeId }, draft: null });
      },
      saveDetails: null, // the library saves the name and detail as you go
      sendDraft: null, // bring it into a campaign from that campaign's builder instead (issue #14 step 4)
      autosave,
      cancelAutosave: () => clearTimeout(timer.current),
      canImport: false, // already in the library: it is the library's own builder
      gmLater: true,
      sentDraft: false,
      backHref: "/",
      backLabel: "Back to your characters",
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

// The draft this device kept, if any. Which one the builder opens on is `pickDraft` (utils.ts), where it's tested; a
// table's records the save it opened on (`stamp`), unless it already names one.
function initialDraft({
  key,
  start,
  tier,
  stamp,
}: {
  key: string;
  start: DraftStart;
  tier: number;
  stamp: number | undefined;
}): Draft {
  let local: Draft | null = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored) local = draftOf(JSON.parse(stored));
  } catch {
    // Storage blocked or a draft from an older builder: start from the saved draft or the saved build instead.
  }
  const picked = pickDraft({ local, start, tier });
  return stamp === undefined || picked.builtAt !== undefined ? picked : { ...picked, builtAt: stamp };
}

type WorkshopProps = { bench: Bench; payload: CreationPayload; onSaved: () => void; initialStep?: BuilderStep };

function Workshop({ bench, payload, onSaved, initialStep }: WorkshopProps) {
  const { key, start, made, play, role } = bench;
  const [draft, setDraft] = useState<Draft>(() => initialDraft({ key, start, tier: bench.tier, stamp: bench.stamp }));
  const locked = made && role !== "gm";
  // Which screen this opens on. A link may ask for one ("?step=advance", the sheet's LEVEL UP badge), and the page
  // reads that on the server and passes it in: deciding it here from `window` would render one screen in the prerender
  // and another after hydration, and `useSearchParams` would push the whole builder out of the prerender.
  const [step, setStep] = useState<BuilderStep>(
    (made && initialStep) || (locked ? "advance" : draft.archetypeId ? "customise" : "tier"),
  );

  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState(bench.overrides);
  const [openedOverrides] = useState(bench.overrides); // what `mergeOverrides` compares the edits with
  const overrideEdit = overrides && openedOverrides ? { base: openedOverrides, edited: overrides } : null;
  // The Tier the build is made at. It stays the draft's own: a character keeps the Tier it was made at (Core p.20 sets
  // the budget from it), and the campaign's Tier now travels separately as `play.tier` (build.ts), so a group that
  // Ascends doesn't rewrite its characters' creation Tier. A blank draft starts at the bench's (`initialDraft`).
  const tier = draft.tier;
  // What the header says: at a table, the Tier the group plays at now; in the library, the one being built at.
  const shownTier = bench.tierEditable ? draft.tier : bench.tier;

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
    const { name: _, detail: __, savedAt: ___, builtAt: ____, archetypeId, ...rest } = draft;
    try {
      const r = resolveBuild({ catalogue, build: { ...rest, archetypeId }, play: play ?? undefined });
      // The sheet is stored with the printed profile and the upgrade ids; the preview shows them applied, as the table
      // will (Core p.227). Only the build is sent to the server, which re-resolves it, so this is display alone.
      // Then the standing weapon effects, at the Rank this build reaches (rules-flow.md §11.68).
      const rank = r.advancement?.rank ?? 1;
      return {
        ...r,
        sheet: withWeaponEffects(withUpgrades(r.sheet, catalogue.wargear), { rank, catalogue: catalogue.wargear }),
      };
    } catch {
      return null; // a malformed draft (an older builder's): START OVER clears it
    }
  }, [draft, catalogue, play]);

  // External systems: localStorage, so a half-made character survives a closed tab on this device, and the library,
  // which keeps the draft for the next device. Opening a character changes nothing, so the first render only writes
  // this device's copy: without that, opening a finished character would push a draft back onto it.
  const autosave = bench.autosave;
  const opened = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Storage blocked (private mode): the draft lives only in this tab.
    }
    if (opened.current) autosave?.(draft);
    opened.current = true;
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
      // The group's Tier has passed the one this character was made at, so it owes this Ascension's package or an
      // Archetype Ascension (Core p.148, rules-flow.md §11.55).
      ascending: !!play && play.tier > tier,
      made,
      importable: bench.canImport && !locked,
      role,
      go,
      sendDraft: bench.sendDraft ? () => bench.sendDraft!({ ...draft, savedAt: Date.now() }) : null,
      sentDraft: bench.sentDraft,
      gmLater: bench.gmLater,
      overrides,
      setOverrides,
    };
  }, [draft, resolved, catalogue, lookups, tier, play, made, locked, role, bench, overrides]);

  // START OVER: drops the draft on this device and goes back to the saved build, or a blank one. At a table a draft
  // sent to the GM lives on the character, not here, so it survives and is picked up again; in the library the stored
  // draft is this same draft's copy, so it goes too.
  const startOver = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    bench.cancelAutosave?.();
    const kept = bench.autosave ? null : start.draft;
    setDraft(initialDraft({ key, start: { ...start, draft: kept }, tier: bench.tier, stamp: bench.stamp }));
    setStep("tier");
  };

  // SAVE: the server re-resolves the build and writes the sheet; away from the builder once it's saved. The pending
  // autosave is dropped first, so a debounced draft can't land on the row just after the finished build did.
  const save = async () => {
    bench.cancelAutosave?.();
    finish(await bench.save(draft, overrideEdit));
  };
  // SAVE DETAILS ONLY: the name, detail and overrides; the build's choices in this draft aren't saved.
  const saveDetails = bench.saveDetails
    ? async () => {
        bench.cancelAutosave?.();
        finish(await bench.saveDetails!(draft, overrideEdit));
      }
    : null;
  const finish = (failure: string | null) => {
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
          <a href={bench.backHref} aria-label={bench.backLabel} className="display" style={{ fontSize: 30 }}>
            ◂
          </a>
          <div className="display gm-title">
            {draft.name.trim() ? draft.name.toUpperCase() : "NEW CHARACTER"}
            <span className="dim"> · BUILDER · T{shownTier}</span>
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
            {step === "review" && <ReviewStep onSave={save} onSaveDetails={saveDetails} sheet={bench.sheet} />}
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
