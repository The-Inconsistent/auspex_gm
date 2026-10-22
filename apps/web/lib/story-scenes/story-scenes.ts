import { onEntryIds, threatProfile, type Codex } from "@wg/shared";

type Beat = Codex["adventures"][number]["beats"][number];
type Entry = Beat["encounter"][number];

// What a scene still lacks before the GM can run it: the short, honest list (no goal, nothing to read aloud, an exit
// that leads nowhere). `sceneIds` are the adventure's scenes, so an exit to a deleted one counts as unwritten.
export function sceneFixes(beat: Pick<Beat, "goal" | "readAloud" | "exits">, sceneIds: string[]): string[] {
  const unwired = beat.exits.filter((e) => !e.beatId || !sceneIds.includes(e.beatId)).length;
  return [
    ...(beat.goal.trim() ? [] : ["NO GOAL"]),
    ...(beat.readAloud.trim() ? [] : ["NO READ-ALOUD"]),
    ...(unwired ? [`${unwired} EXIT${unwired > 1 ? "S" : ""} WITH NO SCENE`] : []),
  ];
}

// The word on a card: READY ✓ or "n TO FIX".
export const readiness = (fixes: string[]) => (fixes.length ? `${fixes.length} TO FIX` : "READY ✓");

// One prepared entry as a name and count: "Ork Boy ×6 (mob)"; `names` maps a threat id to its name.
export const entryName = (e: Entry, names: Map<string, string>) =>
  `${e.label ?? names.get(e.threatId) ?? e.threatId}${e.count > 1 ? ` ×${e.count}${e.asMob ? " (mob)" : ""}` : ""}`;

// The same, with what the GM ticked on it: profiles by name and "scaled" (VoA p.126, Core p.326), so the fight says
// why its numbers won't match the book.
export function entryLine(e: Entry, names: Map<string, string>) {
  const extras = [...e.profiles.map((p) => threatProfile(p).name.toLowerCase()), ...(e.scale ? ["scaled"] : [])];
  return `${entryName(e, names)}${extras.length ? ` · ${extras.join(", ")}` : ""}`;
}

// A card's tagline: type · who is in it · the fight, each only when there is one.
export function tagline(beat: Pick<Beat, "type" | "encounter">, { npcNames, threatNames }: Names) {
  const cast = npcNames.filter(Boolean);
  return [
    beat.type.toUpperCase(),
    ...(cast.length ? [cast.join(", ")] : []),
    ...(beat.encounter.length ? [`FIGHT: ${beat.encounter.map((e) => entryName(e, threatNames)).join(", ")}`] : []),
  ].join(" · ");
}
type Names = { npcNames: string[]; threatNames: Map<string, string> };

// An exit's target as a tag: its scene number (`order` = ids in story order), or null when it leads nowhere.
export function exitNumber(beatId: string | null, order: string[]) {
  const i = beatId ? order.indexOf(beatId) : -1;
  return i < 0 ? null : String(i + 1).padStart(2, "0");
}

// The ids after ticking or unticking one ON ENTRY pick.
export const toggleId = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

// How many of a scene's handouts go to named Agents only (an audience), for the glance's "n PRIVATE".
export const privateHandouts = (
  beat: Pick<Beat, "handoutIds">,
  handouts: Pick<Codex["handouts"][number], "id" | "audience">[],
) => handouts.filter((h) => beat.handoutIds.includes(h.id) && h.audience.length).length;

// The names of what ticking ON ENTRY will show the phones when the scene begins: its place, people and handouts.
export function onEntryNames(
  beat: Pick<Beat, "onEntry" | "locationId" | "npcIds" | "handoutIds">,
  codex: Pick<Codex, "locations" | "npcs" | "handouts">,
) {
  const names = new Map<string, string>([
    ...codex.locations.map((l) => [l.id, l.name] as const),
    ...codex.npcs.map((n) => [n.id, n.name] as const),
    ...codex.handouts.map((h) => [h.id, h.title] as const),
  ]);
  return onEntryIds(beat).flatMap((id) => names.get(id) ?? []);
}
