import type { WizardStep } from "@/components/ui/wizard-steps/constants";

// The steps before CREATE, in the order the user asked for: Tier first, then the premise (the book puts the Framework
// first, Core p.316; the Framework picker still warns when a printed one doesn't fit the Tier).
export const BEFORE_CREATE = ["tier", "premise", "table", "name"] as const satisfies readonly WizardStep[];
export type NewStep = (typeof BEFORE_CREATE)[number];

// What the four steps ask, sent in one POST at CREATE.
export type Draft = {
  name: string;
  tier: number;
  framework: string;
  frameworkBonus: string;
  patron: string;
  kind: string[];
  limits: string[];
};
export const NEW_DRAFT: Draft = {
  name: "",
  tier: 2, // the lobby's old NEW GAME form started here too
  framework: "",
  frameworkBonus: "",
  patron: "",
  kind: [],
  limits: [],
};

// NAME's form, so the footer's CREATE button submits it (and Enter in NAME does too).
export const CREATE_FORM = "new-campaign";
