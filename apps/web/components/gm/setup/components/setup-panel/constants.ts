import type { CodexKind } from "@/components/gm/codex/constants";
import type { GmTab } from "@/components/gm/gm-app/constants";
import type { SetupKey } from "@/lib/setup/constants";

// Another GM tab (CODEX opens on the right kind).
export type TabTarget = { tab: GmTab; kind?: CodexKind };
// Where a step is done: a tab, a panel by its element id (on SETUP itself when there's no tab), or both.
export type GoTo = { label: string; tab?: GmTab; kind?: CodexKind; anchor?: string };

// SETUP's GO TO per step: where the step is done in the app (docs/campaign-model.md "Building a campaign").
export const SETUP_GO_TO = {
  kind: { label: "KIND OF GAME", anchor: "table-talk" },
  framework: { label: "FRAMEWORK", anchor: "fw" },
  tier: { label: "PARTY › ASCEND", tab: "PARTY", anchor: "ascend" },
  setting: { label: "CODEX › LOCATIONS", tab: "CODEX", kind: "location" },
  patron: { label: "PATRON", anchor: "patron" },
  factions: { label: "CODEX › FACTIONS", tab: "CODEX", kind: "faction" },
  characters: { label: "PARTY › AGENTS", tab: "PARTY", anchor: "agents" },
  npcs: { label: "CODEX › NPCS", tab: "CODEX", kind: "npc" },
  scenes: { label: "STORY", tab: "STORY" },
  combat: { label: "STORY › SCENES", tab: "STORY" },
  session: { label: "PARTY › SESSION", tab: "PARTY", anchor: "session" },
} as const satisfies Record<SetupKey, GoTo>;
