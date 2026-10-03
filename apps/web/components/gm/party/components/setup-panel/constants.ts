import type { CodexKind } from "@/components/gm/codex/constants";
import type { GmTab } from "@/components/gm/gm-app/constants";
import type { SetupKey } from "@/lib/setup/constants";

// Another GM tab (CODEX opens on the right kind), or a panel further down PARTY by its element id.
export type TabTarget = { tab: GmTab; kind?: CodexKind };
type GoTo = { label: string } & (TabTarget | { anchor: string });

// SETUP's GO TO per step: where the step is done in the app (docs/campaign-model.md "Building a campaign").
export const SETUP_GO_TO = {
  kind: { label: "KIND OF GAME", anchor: "table-talk" },
  framework: { label: "FRAMEWORK", anchor: "fw" },
  tier: { label: "ASCEND", anchor: "ascend" },
  setting: { label: "CODEX › LOCATIONS", tab: "CODEX", kind: "location" },
  patron: { label: "PATRON", anchor: "patron" },
  factions: { label: "CODEX › FACTIONS", tab: "CODEX", kind: "faction" },
  characters: { label: "AGENTS", anchor: "agents" },
  npcs: { label: "CODEX › NPCS", tab: "CODEX", kind: "npc" },
  scenes: { label: "PREP", tab: "PREP" },
  combat: { label: "PREP › SCENES", tab: "PREP" },
  session: { label: "SESSION", anchor: "session" },
} as const satisfies Record<SetupKey, GoTo>;
