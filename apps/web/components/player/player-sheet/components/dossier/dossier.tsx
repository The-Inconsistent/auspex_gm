"use client";
import type { Character, DerivedStats, LiveState } from "@wg/shared";

import { SheetGuide } from "@/components/ui/sheet-guide/sheet-guide";
import type { Send } from "@/hooks/use-table/use-table";

import { DOSSIER_JUMPS } from "../../constants";
import { AttributesBox } from "../attributes-box/attributes-box";
import { InjuriesBox } from "../injuries-box/injuries-box";
import { NotesBox } from "../notes-box/notes-box";
import { SheetHead } from "../sheet-head/sheet-head";
import { SkillsBox } from "../skills-box/skills-box";
import { TalentsBox } from "../talents-box/talents-box";
import { TraitsBox } from "../traits-box/traits-box";
import { Wargear } from "../wargear/wargear";
import { WrathBox } from "../wrath-box/wrath-box";
import { XpBox } from "../xp-box/xp-box";

type DossierProps = {
  me: Character;
  d: DerivedStats;
  state: LiveState;
  send: Send;
  buildHref: string;
  onError: (error: string | null) => void;
};

// DOSSIER: the Agent as the book's character sheet (Core pp.40–41), its two pages as two framed sheets, the boxes in
// the book's order. A box the app has no data for (Objective, Faith, Memorable Injuries, Psychic Powers, Stealth) isn't
// drawn. Our own parts stay: the name bar and Tier strip, WARGEAR as a datacard, and tap-for-meaning on every term.
export function Dossier({ me, d, state, send, buildHref, onError }: DossierProps) {
  const tier = state.campaign.tier;
  return (
    <>
      <SheetGuide />
      <nav className="ps-jump" aria-label="Jump to">
        {DOSSIER_JUMPS.map((j) => (
          <a key={j.id} href={`#${j.id}`}>
            {j.label}
          </a>
        ))}
      </nav>

      <div className="bs-sheet">
        <SheetHead me={me} tier={tier} />
        <AttributesBox me={me} />
        <SkillsBox me={me} />
        <WrathBox me={me} state={state} send={send} />
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
