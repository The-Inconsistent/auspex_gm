"use client";
import { deriveStats, type Character, type LiveState } from "@wg/shared";

import { BUILD_STEP_PARAM } from "@/components/builder/constants";
import type { Send } from "@/hooks/use-table/use-table";

import { AttributesBox } from "./components/attributes-box/attributes-box";
import { InjuriesBox } from "./components/injuries-box/injuries-box";
import { NotesBox } from "./components/notes-box/notes-box";
import { SheetHead } from "./components/sheet-head/sheet-head";
import { SkillsBox } from "./components/skills-box/skills-box";
import { TalentsBox } from "./components/talents-box/talents-box";
import { TraitsBox } from "./components/traits-box/traits-box";
import { Wargear } from "./components/wargear/wargear";
import { WrathBox } from "./components/wrath-box/wrath-box";
import { XpBox } from "./components/xp-box/xp-box";

type BookSheetProps = {
  me: Character;
  tier: number;
  // The live table: the player's own phone (`asks`: SPEND WRATH asks the GM, §11.122) or the GM's PARTY. Without it
  // (the JOIN page's READ) the sheet is read-only, and the boxes a seat brings (Wrath, Injuries & Corruption, Notes, XP)
  // aren't drawn.
  table?: { state: LiveState; send: Send; onError: (error: string | null) => void; asks?: boolean };
  textless?: string; // under Talents & Abilities whose text was stripped (the JOIN page, for a guest)
};

// The Agent as the book's character sheet (Core pp.40–41): its two pages as two framed sheets, the boxes in the book's
// order. The one sheet every view draws (the player's DOSSIER, GM PARTY's SHEET, the JOIN page's READ), so a change
// here reaches them all. A box the app has no data for (Objective, Faith, Memorable Injuries, Psychic Powers, Stealth)
// isn't drawn.
export function BookSheet({ me, tier, table, textless }: BookSheetProps) {
  const d = deriveStats({ stats: me.stats, overrides: me.overrides, tier });
  if (!table)
    return (
      <div className="bs-sheet">
        <SheetHead me={me} tier={tier} />
        <AttributesBox me={me} />
        <SkillsBox me={me} />
        <TraitsBox me={me} d={d} tier={tier} />
        <Wargear me={me} />
        <TalentsBox me={me} textless={textless} />
      </div>
    );
  const { state, send, onError, asks = false } = table;
  // Where XP is spent: the builder's ADVANCE screen for a character already made (Core pp.146–151), the builder from
  // the top for one that isn't.
  const buildHref = `/c/${state.campaign.id}/build/${me.id}${me.build ? `?${BUILD_STEP_PARAM}=advance` : ""}`;
  return (
    <>
      <div className="bs-sheet">
        <SheetHead me={me} tier={tier} />
        <AttributesBox me={me} />
        <SkillsBox me={me} />
        <WrathBox me={me} state={state} send={send} asks={asks} />
        <TraitsBox me={me} d={d} tier={tier} />
        <Wargear me={me} live={{ d, send, onError }} />
      </div>
      <div className="bs-sheet">
        <TalentsBox me={me} />
        <InjuriesBox me={me} d={d} />
        <NotesBox me={me} send={send} onError={onError} />
        <XpBox me={me} d={d} buildHref={buildHref} />
      </div>
    </>
  );
}
