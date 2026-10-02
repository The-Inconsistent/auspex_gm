import { z } from "zod";
import { CodexInput } from "./codex.ts";
import { THREAT_SOURCES, threatCite, type ThreatSource } from "./threat.ts";

// GM-only book data for CODEX › NPCS' ADD FROM BOOK (GitHub issue #47), served by /api/campaigns/:id/npc-presets.

export const NpcCite = z.object({
  source: z.enum(Object.keys(THREAT_SOURCES) as [ThreatSource, ...ThreatSource[]]),
  page: z.number().int().positive(), // printed page
});

// A printed NPC to start one from. Players see NAME, ROLE and DESCRIPTION once the NPC is revealed, so a preset fills
// the name and a short role label, leaves DESCRIPTION empty, and keeps printed text in GM NOTES and SECRETS. One record
// per person: someone printed in two books carries both cites. `faction` is a codex faction's name to link.
export const NpcPreset = CodexInput.npc.omit({ factionId: true, revealed: true }).extend({
  id: z.string().min(1),
  cites: z.array(NpcCite).min(1),
  faction: z.string().min(1).optional(),
});
export type NpcPreset = z.infer<typeof NpcPreset>;

// "Wretches p.5 · FSPG p.88": the line a preset's GM NOTES open with.
export const citeLine = (p: Pick<NpcPreset, "cites">) => p.cites.map(threatCite).join(" · ");

// ADD FROM BOOK: a printed NPC as a new codex NPC, hidden until the Agents meet them. The faction links when the codex
// has one of that name.
export function presetNpc(p: NpcPreset, factions: readonly { id: string; name: string }[]) {
  const line = citeLine(p);
  const faction = p.faction && factions.find((f) => f.name.toLowerCase() === p.faction!.toLowerCase());
  return {
    name: p.name,
    factionId: faction ? faction.id : null,
    role: p.role,
    description: "",
    gmNotes: p.gmNotes ? `${line}\n\n${p.gmNotes}` : line,
    secrets: p.secrets,
    attitude: p.attitude,
    statSource: p.statSource,
    revealed: false,
  } satisfies z.input<typeof CodexInput.npc>;
}

// Whether a codex NPC came from this preset: the same name, and the cite line `presetNpc` opens GM NOTES with.
export const npcFromPreset = (n: { name: string; gmNotes: string }, p: NpcPreset) =>
  n.name === p.name && n.gmNotes.split("\n", 1)[0] === citeLine(p);

// A transcribed preset over the catalogue patron of the same id (issue #47): the transcription wins, keeping the
// patron's cite as well.
export function mergeCites(base: NpcPreset, over: NpcPreset): NpcPreset {
  const seen = new Set(over.cites.map(threatCite));
  return { ...over, cites: [...over.cites, ...base.cites.filter((c) => !seen.has(threatCite(c)))] };
}
