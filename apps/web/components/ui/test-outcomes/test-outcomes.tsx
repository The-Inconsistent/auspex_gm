"use client";
import { isCorruptionDn, type ActionResult, type BeatTest, type Character } from "@wg/shared";

import { CorruptionTest } from "@/components/ui/corruption-test/corruption-test";
import type { Send } from "@/hooks/use-table/use-table";

type TestOutcomesProps = {
  test: BeatTest;
  characters: Character[]; // for a Corruption Test's record
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A prepared Test's Shift ladder and outcomes, and a failed Corruption Test's record: under the Test on STORY's page and
// in SCENE's fold, so the GM reads the same thing at prep and at the table.
export function TestOutcomes({ test: t, characters, send, onReport }: TestOutcomesProps) {
  return (
    <>
      {t.shifts.map((s, j) => (
        <div key={j}>
          <span className="label">SHIFT {j + 1}</span> {s}
        </div>
      ))}
      {t.onSuccess && (
        <div>
          <span className="label">ON SUCCESS</span> {t.onSuccess}
        </div>
      )}
      {t.onFailure && (
        <div>
          <span className="label">ON FAILURE</span> {t.onFailure}
        </div>
      )}
      {t.kind === "corruption" && isCorruptionDn(t.dn) && characters.length > 0 && (
        <CorruptionTest source={t.dn} characters={characters} send={send} onReport={onReport} />
      )}
    </>
  );
}
