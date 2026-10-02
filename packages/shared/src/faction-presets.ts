import { z } from "zod";
import { CodexInput } from "./codex.ts";
import { Source } from "./source.ts";
import { THREAT_SOURCES, threatCite, type ThreatSource } from "./threat.ts";

// GM-only book data for CODEX › FACTIONS (GitHub issue #46), served by /api/campaigns/:id/faction-presets. Book text,
// so it never reaches a player; factions themselves never do either (toPlayerCodex).

// A Keyword the picker suggests (Core pp.375–378): a keyword record, or the keyword a sub-faction fills in ("SPACE
// WOLVES"), with its glossary text where the catalogue has it.
export const FactionKeyword = z.object({
  name: z.string(),
  text: z.string().default(""),
  source: Source,
  page: z.number().int().positive(),
});
export type FactionKeyword = z.infer<typeof FactionKeyword>;

// A printed faction to start one from. Keywords only where the page prints them (or a §11 ruling maps them).
export const FactionPreset = CodexInput.faction.omit({ stance: true }).extend({
  id: z.string().min(1),
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
  page: z.number().int().positive(), // printed page
});
export type FactionPreset = z.infer<typeof FactionPreset>;

export const FactionPresets = z.object({
  keywords: z.array(FactionKeyword),
  presets: z.array(FactionPreset),
});
export type FactionPresets = z.infer<typeof FactionPresets>;

// ADD FROM BOOK: a printed faction as a new codex faction. The stance starts neutral (the books don't say how a faction
// stands with this group), and the notes open with the cite so the GM can find the page again.
export function presetFaction(p: FactionPreset) {
  const cite = threatCite(p);
  return {
    name: p.name,
    keywords: p.keywords,
    stance: "neutral",
    notes: p.notes ? `${cite}\n\n${p.notes}` : cite,
    secrets: p.secrets,
  } satisfies z.input<typeof CodexInput.faction>;
}

// Whether a codex faction came from this preset: the same name, and the cite `presetFaction` opens its notes with. The
// cite tells two books' factions of the same name apart (the Administratum of the Forsaken System Player's Guide and of
// Litanies of the Lost).
export const fromPreset = (f: { name: string; notes: string }, p: FactionPreset) =>
  f.name === p.name && f.notes.split("\n", 1)[0] === threatCite(p);
