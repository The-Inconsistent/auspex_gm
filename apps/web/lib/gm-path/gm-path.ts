import { CODEX_KIND_KEYS, type CodexKind } from "@/components/gm/codex/constants";
import type { GmTab } from "@/components/gm/gm-app/constants";
import { DOSSIER_TABS, type DossierTab } from "@/components/gm/party/constants";
import { BEAT_SECTIONS, type BeatSection } from "@/components/gm/prep/components/beat-editor/constants";

// Every GM screen has a URL under /c/<id> (docs/frontend.md §4.1), so a refresh, Back or a bookmark lands on the same
// tab, entry or editor. These build them; the folders under app/c/[campaignId]/(table)/ are the same shapes.

// CODEX's sub-tabs read as plurals in the URL: /codex/npcs, /codex/locations…
export const CODEX_SEGMENTS = {
  npc: "npcs",
  location: "locations",
  handout: "handouts",
  faction: "factions",
  item: "items",
} as const satisfies Record<CodexKind, string>;
export const THREATS_SEGMENT = "threats";

export const asCodexKind = (segment: string): CodexKind | undefined =>
  CODEX_KIND_KEYS.find((k) => CODEX_SEGMENTS[k] === segment);
export const asBeatSection = (segment: string): BeatSection | undefined => BEAT_SECTIONS.find((s) => s === segment);
export const asDossierTab = (segment: string): DossierTab | undefined => DOSSIER_TABS.find((t) => t === segment);

// A STORY scene opens on its page, its editor (every section) or one section's editor.
export type SceneEdit = "all" | BeatSection;
// STORY's two ways to add a scene: + NEW SCENE and + SCENE FROM A TABLE, each a segment after the adventure.
export const NEW_SCENE = ["new", "from-table"] as const;
export type NewScene = (typeof NEW_SCENE)[number];

type StoryTarget = { campaignId: string; adventureId?: string; sceneId?: string; edit?: SceneEdit };
type CodexTarget = { campaignId: string; kind: CodexKind; entryId?: string; edit?: boolean };
type PartyTarget = { campaignId: string; characterId?: string; tab?: DossierTab };

const at = (...parts: (string | undefined)[]) =>
  parts
    .filter((p): p is string => p !== undefined)
    .map(encodeURIComponent)
    .join("/");

// Builders with more than one id take an options object, so two ids can't swap places unnoticed.
export const gmPath = {
  tab: (campaignId: string, tab: GmTab) => `/c/${at(campaignId, tab.toLowerCase())}`,
  scene: (campaignId: string, fight = false) => `/c/${at(campaignId, "scene", fight ? "fight" : undefined)}`,
  // The board (an adventure's, or the default one), a scene's page, or its editor.
  story: ({ campaignId, adventureId, sceneId, edit }: StoryTarget) =>
    `/c/${at(campaignId, "story", adventureId, sceneId, edit && "edit", edit === "all" ? undefined : edit)}`,
  newScene: ({ campaignId, adventureId, from }: { campaignId: string; adventureId: string; from: NewScene }) =>
    `/c/${at(campaignId, "story", adventureId, from)}`,
  // A kind's list, one entry opened on it, or its editor.
  codex: ({ campaignId, kind, entryId, edit = false }: CodexTarget) =>
    `/c/${at(campaignId, "codex", CODEX_SEGMENTS[kind], entryId, edit ? "edit" : undefined)}`,
  newEntry: (campaignId: string, kind: CodexKind) => `/c/${at(campaignId, "codex", CODEX_SEGMENTS[kind], "new")}`,
  threats: ({ campaignId, slug }: { campaignId: string; slug?: string }) =>
    `/c/${at(campaignId, "codex", THREATS_SEGMENT, slug, slug ? "edit" : undefined)}`,
  // The roster, one Agent's dossier on a tab, or RESPITE's sheet.
  party: ({ campaignId, characterId, tab }: PartyTarget) =>
    `/c/${at(campaignId, "party", characterId, tab === "status" ? undefined : tab)}`,
  respite: (campaignId: string) => `/c/${at(campaignId, "party", "respite")}`,
};
