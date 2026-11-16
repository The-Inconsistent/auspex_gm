"use client";
import type { Character, Codex, LiveState } from "@wg/shared";

import { BookSheet } from "@/components/ui/book-sheet/book-sheet";
import { SheetGuide } from "@/components/ui/sheet-guide/sheet-guide";
import type { Send } from "@/hooks/use-table/use-table";

import { DOSSIER_JUMPS } from "../../constants";
import { ungivenGear } from "../../utils";

type DossierProps = {
  me: Character;
  state: LiveState;
  codex: Codex; // this Agent's given items (toPlayerCodex), whose gear lines live in INTEL › MISSION
  send: Send;
  onError: (error: string | null) => void;
};

// DOSSIER: the book's character sheet (ui/book-sheet), live on the player's own phone, under HOW TO READ THIS SHEET
// and a jump strip to its boxes. Our own parts stay: the name bar and Tier strip, WARGEAR as a datacard, and
// tap-for-meaning on every term.
export function Dossier({ me, state, codex, send, onError }: DossierProps) {
  const sheet = { ...me, stats: { ...me.stats, gear: ungivenGear(me.stats.gear, codex.items) } };
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
      <BookSheet me={sheet} tier={state.campaign.tier} table={{ state, send, onError, asks: true }} />
    </>
  );
}
