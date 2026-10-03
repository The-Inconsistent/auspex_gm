import { quickRow, threatCite, type Threat } from "@wg/shared";

import { blankDraft, cloneDraft, quickDraft, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";

type ThreatStartsProps = {
  bestiary: Threat[];
  tier: number;
  disabled: boolean; // the custom-threat cap
  onStart: (draft: ThreatDraft) => void;
};

// The three ways to start a custom stat block (issue #43). CODEX › THREATS and a scene's + NEW CUSTOM THREAT both offer
// them; a fragment, so each caller puts them in its own row.
export function ThreatStarts({ bestiary, tier, disabled, onStart }: ThreatStartsProps) {
  return (
    <>
      {/* All three disabled at the cap: a form the server would refuse on CREATE wastes the GM's typing. */}
      <ThreatPicker
        bestiary={bestiary}
        tier={tier}
        onPick={(t) => onStart(cloneDraft(t, threatCite(t)))}
        label="CLONE FROM BESTIARY"
        className="btn sm"
        disabled={disabled}
      />
      <button className="btn sm" disabled={disabled} onClick={() => onStart(blankDraft())}>
        BLANK
      </button>
      {/* The Core p.326 row for this Tier: the derived numbers, and the Attributes left to the GM (§11.110). */}
      <button className="btn sm" disabled={disabled} onClick={() => onStart(quickDraft(tier))}>
        QUICK (TIER {quickRow(tier).tier})
      </button>
    </>
  );
}
