import type { StaticImageData } from "next/image";

import type { Character, Combatant } from "@wg/shared";

import aegisVeteran from "@/assets/ops/dw/deathwatch-aegis-veteran.webp";
import blademasterVeteran from "@/assets/ops/dw/deathwatch-blademaster-veteran.webp";
import bombardVeteran from "@/assets/ops/dw/deathwatch-bombard-veteran.webp";
import breacherVeteran from "@/assets/ops/dw/deathwatch-breacher-veteran.webp";
import demolisherVeteran from "@/assets/ops/dw/deathwatch-demolisher-veteran.webp";
import disruptorVeteran from "@/assets/ops/dw/deathwatch-disruptor-veteran.webp";
import gunnerVeteran from "@/assets/ops/dw/deathwatch-gunner-veteran.webp";
import headtakerVeteran from "@/assets/ops/dw/deathwatch-headtaker-veteran.webp";
import hordeSlayerVeteran from "@/assets/ops/dw/deathwatch-horde-slayer-veteran.webp";
import marksmanVeteran from "@/assets/ops/dw/deathwatch-marksman-veteran.webp";
import watchSergeant from "@/assets/ops/dw/deathwatch-watch-sergeant.webp";
import kommandoBombSquig from "@/assets/ops/kom/kommando-bomb-squig.webp";
import kommandoBossNob from "@/assets/ops/kom/kommando-boss-nob.webp";
import kommandoBoy from "@/assets/ops/kom/kommando-boy.webp";
import kommandoBreachaBoy from "@/assets/ops/kom/kommando-breacha-boy.webp";
import kommandoBurnaBoy from "@/assets/ops/kom/kommando-burna-boy.webp";
import kommandoCommsBoy from "@/assets/ops/kom/kommando-comms-boy.webp";
import kommandoDakkaBoy from "@/assets/ops/kom/kommando-dakka-boy.webp";
import kommandoGrot from "@/assets/ops/kom/kommando-grot.webp";
import kommandoRokkitBoy from "@/assets/ops/kom/kommando-rokkit-boy.webp";
import kommandoSlashaBoy from "@/assets/ops/kom/kommando-slasha-boy.webp";
import kommandoSnipaBoy from "@/assets/ops/kom/kommando-snipa-boy.webp";
import yaegirRiflekyn from "@/assets/ops/hernkyn-yaegirs/yaegir-riflekyn.webp";
import yaegirTheyn from "@/assets/ops/hernkyn-yaegirs/yaegir-theyn.webp";
import yaegirWarrior from "@/assets/ops/hernkyn-yaegirs/yaegir-warrior.webp";

// Miniature photos by slug (= file basename), the value of a character's `detail.portrait`.
// ponytail: GW's copyrighted photos ship as static assets: hashed URLs nobody guesses, but not seat-gated like book
// content (CLAUDE.md); serve them through an authenticated api route if the repo or app ever opens up.
export const PORTRAITS = {
  "deathwatch-aegis-veteran": aegisVeteran,
  "deathwatch-blademaster-veteran": blademasterVeteran,
  "deathwatch-bombard-veteran": bombardVeteran,
  "deathwatch-breacher-veteran": breacherVeteran,
  "deathwatch-demolisher-veteran": demolisherVeteran,
  "deathwatch-disruptor-veteran": disruptorVeteran,
  "deathwatch-gunner-veteran": gunnerVeteran,
  "deathwatch-headtaker-veteran": headtakerVeteran,
  "deathwatch-horde-slayer-veteran": hordeSlayerVeteran,
  "deathwatch-marksman-veteran": marksmanVeteran,
  "deathwatch-watch-sergeant": watchSergeant,
  "kommando-bomb-squig": kommandoBombSquig,
  "kommando-boss-nob": kommandoBossNob,
  "kommando-boy": kommandoBoy,
  "kommando-breacha-boy": kommandoBreachaBoy,
  "kommando-burna-boy": kommandoBurnaBoy,
  "kommando-comms-boy": kommandoCommsBoy,
  "kommando-dakka-boy": kommandoDakkaBoy,
  "kommando-grot": kommandoGrot,
  "kommando-rokkit-boy": kommandoRokkitBoy,
  "kommando-slasha-boy": kommandoSlashaBoy,
  "kommando-snipa-boy": kommandoSnipaBoy,
  "yaegir-riflekyn": yaegirRiflekyn,
  "yaegir-theyn": yaegirTheyn,
  "yaegir-warrior": yaegirWarrior,
} satisfies Record<string, StaticImageData>;
type PortraitSlug = keyof typeof PORTRAITS;

// Threat id (packages/data/threats) → the miniature that stands in for it. Ids with no file yet just never match.
const THREAT_PORTRAITS: Record<string, PortraitSlug> = {
  gutshiva: "kommando-boss-nob",
  "dudd-the-bomb-squig": "kommando-bomb-squig",
  kommando: "kommando-boy",
  grot: "kommando-grot",
  "kommando-breacha-boy": "kommando-breacha-boy",
  "kommando-slasha-boy": "kommando-slasha-boy",
  "kommando-snipa-boy": "kommando-snipa-boy",
  "kommando-dakka-boy": "kommando-dakka-boy",
  // Custom threats keep their id through an import (the slug is the row's identity).
  "custom-yaegir-theyn": "yaegir-theyn",
  "custom-yaegir-riflekyn": "yaegir-riflekyn",
  "custom-yaegir-warrior": "yaegir-warrior",
};

// Object.hasOwn: slugs come from the server, and "constructor" must not find Object.prototype's.
export const portrait = (slug: string | undefined): StaticImageData | undefined =>
  slug && Object.hasOwn(PORTRAITS, slug) ? PORTRAITS[slug as PortraitSlug] : undefined;

export const threatPortrait = (threatId: string) => portrait(THREAT_PORTRAITS[threatId]);

// A tracker row's thumbnail: a PC by its character's portrait, a threat by its stat block.
export const combatantPortrait = ({ combatant: c, character }: { combatant: Combatant; character?: Character }) =>
  c.kind === "pc" ? portrait(character?.detail.portrait) : threatPortrait(c.threatId);
