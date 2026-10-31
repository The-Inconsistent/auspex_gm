import { useMemo } from "react";

import { CUSTOM_THREAT_CAP, quickRow, THREAT_CLASS_LABEL, threatCite, threatClassAt, type Threat } from "@wg/shared";

import { FindField } from "@/components/ui/find-field/find-field";
import { blankDraft, cloneDraft, quickDraft, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { FACTION_LABEL } from "@/components/ui/threat-picker/constants";

type ThreatStartsProps = {
  bestiary: Threat[];
  tier: number;
  full: boolean; // at the custom-threat cap, even when another tablet filled it while these were open
  onStart: (draft: ThreatDraft) => void;
};

// The three ways to start a custom stat block (issue #43, canvas Threats-New): copy a book one found by name, a blank
// page, or QUICK. CODEX › THREATS shows them in its NEW THREAT dialog, a scene's + NEW CUSTOM THREAT in its fight part.
// None at the custom-threat cap, since a form the server would refuse wastes the GM's typing.
export function ThreatStarts({ bestiary, tier, full, onStart }: ThreatStartsProps) {
  // The cite on each: a name like Cultist is printed in several books, each its own stat block (rules-flow §11.71).
  const options = useMemo(
    () =>
      bestiary.map((t) => ({
        id: t.id,
        name: t.name,
        detail: `${threatCite(t)} · ${FACTION_LABEL[t.faction]}`,
        // Found by its faction, book or keywords too: "Orks", "Core", "Khorne".
        also: `${FACTION_LABEL[t.faction]} ${threatCite(t)} ${t.keywords.join(" ")}`,
        chip: <span className="chip">{THREAT_CLASS_LABEL[threatClassAt(t, tier)]}</span>,
      })),
    [bestiary, tier],
  );
  const copy = (id: string) => {
    const t = bestiary.find((b) => b.id === id);
    if (t) onStart(cloneDraft(t, threatCite(t)));
  };

  if (full)
    return <span className="dim">Custom threats are full ({CUSTOM_THREAT_CAP}). Delete one to start another.</span>;

  return (
    <div className="th-starts">
      <span className="label red">FROM THE BESTIARY</span>
      <span className="dim">Copy a book stat block, then change what your table needs. The copy notes its page.</span>
      <FindField
        label="Find a book threat to copy"
        options={options}
        onPick={copy}
        newLabel={(q) => `+ A BLANK PAGE NAMED “${q}”`}
        onCreate={(q) => onStart({ ...blankDraft(), name: q })}
      />
      <div className="th-or">OR START FROM</div>
      <div className="keys">
        <button className="btn" onClick={() => onStart(blankDraft())}>
          A BLANK PAGE
        </button>
        {/* The Core p.326 row for this Tier: the derived numbers, and the Attributes left to the GM (§11.110). */}
        <button className="btn" onClick={() => onStart(quickDraft(tier))}>
          QUICK · TIER {quickRow(tier).tier}
        </button>
      </div>
    </div>
  );
}
