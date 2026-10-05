"use client";
import { useState } from "react";

import { corruptionGained, type ActionResult, type BeatTest, type Character } from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";

import { TEST_RULES } from "../../constants";
import { dnLabel, ruinOnFailure, testTitle } from "../../utils";
import type { Send } from "@/hooks/use-table/use-table";

type SceneTestsProps = {
  tests: BeatTest[];
  characters: Character[];
  send: Send;
  onReport: (r: ActionResult, ok: string) => void;
};

// A failed Corruption Test (Core pp.285–286, rules-flow §9): the Agent gains DN − Icons Corruption (doubled on a
// Complication) and the GM gains 1 Ruin (p.320), in one tap. The dice stay on the table: the Icons are typed in.
function CorruptionFailed({ dn, characters, send, onReport }: Omit<SceneTestsProps, "tests"> & { dn: number }) {
  const [who, setWho] = useState(characters[0]?.id ?? "");
  const [icons, setIcons] = useState<number | null>(null); // empty = no Icons
  const [complication, setComplication] = useState(false);
  const gain = corruptionGained({ dn, icons: icons ?? 0, complication });
  const agent = characters.find((c) => c.id === who);
  return (
    <div className="keys" style={{ alignItems: "flex-end" }}>
      <div className="field">
        <label className="label">AGENT</label>
        <select className="input" aria-label="Agent who failed" value={who} onChange={(e) => setWho(e.target.value)}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="label">ICONS ROLLED</span>
        <NumberInput value={icons} label="Icons rolled" max={20} onChange={setIcons} />
      </div>
      <button
        className={`btn sm ${complication ? "primary" : ""}`}
        aria-pressed={complication}
        onClick={() => setComplication(!complication)}
      >
        COMPLICATION ×2
      </button>
      <button
        className="btn sm danger"
        disabled={!agent}
        onClick={async () =>
          agent &&
          onReport(
            await send({ type: "character.corruption", id: agent.id, delta: gain, ruin: true }),
            `${agent.name.toUpperCase()} FAILED · +${gain} CORRUPTION · +1 RUIN`,
          )
        }
      >
        FAILED · +{gain} CORRUPTION
      </button>
    </div>
  );
}

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
              {t.kind === "corruption" && t.dn !== null && characters.length > 0 && (
                <CorruptionFailed dn={t.dn} characters={characters} send={send} onReport={onReport} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
