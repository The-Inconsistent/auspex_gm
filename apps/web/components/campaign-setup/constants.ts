import type { CodexKind } from "@wg/shared";

import type { WizardStep } from "@/components/ui/wizard-steps/constants";

// NEW CAMPAIGN's steps after CREATE, inside the campaign.
export const AFTER_CREATE = ["setting", "factions", "players"] as const satisfies readonly WizardStep[];
export type SetupStep = (typeof AFTER_CREATE)[number];

// The codex kinds SETTING and FACTIONS add by a typed name (AddByName).
export const TYPED_KINDS = ["location", "faction"] as const satisfies readonly CodexKind[];
export type TypedKind = (typeof TYPED_KINDS)[number];
