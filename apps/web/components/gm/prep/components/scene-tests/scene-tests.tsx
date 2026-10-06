"use client";
import { isCorruptionDn, type ActionResult, type BeatTest, type Character } from "@wg/shared";

import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import type { Send } from "@/hooks/use-table/use-table";

import { TEST_RULES } from "../../constants";
import { dnLabel, ruinOnFailure, testTitle } from "../../utils";
import { CorruptionFailed } from "./components/corruption-failed/corruption-failed";

type SceneTestsProps = {
  tests: BeatTest[];
  characters: Character[];
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A scene's Tests on its PREP card (issue #39): one line each, opening to its purpose, Shift ladder and outcomes. The
// dice stay on the table; this is what the GM has ready.
export function SceneTests({ tests, characters, send, onReport }: SceneTestsProps) {
  return (
    <div className="field">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="label" style={{ flex: 1 }}>
          TESTS · {tests.length}
        </span>
        {TEST_RULES.map(([id, label]) => (
          <RuleIdLink key={id} id={id}>
            <span className="chip">{label}</span>
          </RuleIdLink>
        ))}
      </div>
      {tests.map((t, i) => {
        const ruin = ruinOnFailure(t);
        return (
          <details key={i}>
            <summary style={{ cursor: "pointer" }}>
              <b>{testTitle(t)}</b> <span className="chip">{dnLabel(t)}</span>{" "}
              {t.who === "each" && <span className="chip">EACH</span>}{" "}
              {t.shifts.length > 0 && (
                <span className="dim">
                  {t.shifts.length} SHIFT{t.shifts.length > 1 ? "S" : ""}
                </span>
              )}{" "}
              {ruin && <span className="chip warn">{ruin}</span>}
            </summary>
            <div className="stack" style={{ gap: 4, padding: "6px 0 6px 18px" }}>
              {t.purpose && (
                <div>
                  <span className="label">PURPOSE</span> <i>{t.purpose}</i>
                </div>
              )}
              {t.shifts.map((s, j) => (
                <div key={j}>
                  <span className="label">SHIFT {j + 1}</span> {s}
                </div>
              ))}
              {t.onSuccess && (
                <div>
                  <span className="label">SUCCESS</span> {t.onSuccess}
                </div>
              )}
              {t.onFailure && (
                <div>
                  <span className="label">FAILURE</span> {t.onFailure}
                </div>
              )}
              {t.kind === "corruption" && isCorruptionDn(t.dn) && characters.length > 0 && (
                <CorruptionFailed source={t.dn} characters={characters} send={send} onReport={onReport} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
