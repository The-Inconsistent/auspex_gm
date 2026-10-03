import type { WizardStep } from "@/components/ui/wizard-steps/constants";

// NEW CAMPAIGN's steps after CREATE, inside the campaign.
export const AFTER_CREATE = ["setting", "factions", "players"] as const satisfies readonly WizardStep[];
export type SetupStep = (typeof AFTER_CREATE)[number];
