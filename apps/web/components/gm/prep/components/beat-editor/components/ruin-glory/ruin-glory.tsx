"use client";
import { MAX_POOL_LINES, MAX_POOL_STEP, type Pool } from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import { RuleIdLink } from "@/components/ui/rule-link/rule-link";

import type { PoolDrafts } from "../../../../types";
import { SPEND_POOLS } from "./constants";

type RuinGloryProps = { lines: PoolDrafts; onChange: (lines: PoolDrafts) => void };

// What earns Ruin and Glory in this scene, and the spends the GM plans (issue #40). PREP turns each line into a tap.
export function RuinGlory({ lines, onChange }: RuinGloryProps) {
  const setLine = (list: Pool, i: number, patch: Partial<PoolDrafts[Pool][number]>) =>
    onChange({ ...lines, [list]: lines[list].map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setSpend = (i: number, patch: Partial<PoolDrafts["spends"][number]>) =>
    onChange({ ...lines, spends: lines.spends.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const earned = (list: Pool, label: string, hint: string) => (
    <div className="field">
      <span className="label">
        {label} ·{" "}
        <RuleIdLink id={`character-${list}`}>
          <span className={`chip ${list === "ruin" ? "warn" : ""}`}>{list.toUpperCase()}</span>
        </RuleIdLink>
      </span>
      {lines[list].map((l, i) => (
        <div key={i} className="keys" style={{ alignItems: "center" }}>
          <span className="dim">+</span>
          <NumberInput
            value={l.amount}
            label={`${list} line ${i + 1}, amount`}
            max={MAX_POOL_STEP}
            onChange={(amount) => setLine(list, i, { amount })}
          />
          <input
            className="input"
            style={{ flex: "1 1 240px", width: "auto" }}
            aria-label={`${list} line ${i + 1}`}
            placeholder={list === "ruin" ? "Each failed Survival Test" : "They disarm it without raising the alarm"}
            maxLength={200}
            value={l.text}
            onChange={(e) => setLine(list, i, { text: e.target.value })}
          />
          <button
            className="btn sm danger"
            aria-label={`Remove ${list} line ${i + 1}`}
            onClick={() => onChange({ ...lines, [list]: lines[list].filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="keys" style={{ alignItems: "center" }}>
        <button
          className="btn sm"
          disabled={lines[list].length >= MAX_POOL_LINES}
          onClick={() => onChange({ ...lines, [list]: [...lines[list], { text: "", amount: 1 }] })}
        >
          + {list.toUpperCase()}
        </button>
        <span className="dim" style={{ fontSize: 12 }}>
          {hint}
        </span>
      </div>
    </div>
  );

  return (
    <>
      {earned(
        "ruin",
        "RUIN · WHAT EARNS IT HERE",
        "Always +1, in any scene: a player fails a Corruption or Fear Test, or you roll a 6 on the Wrath Die (Core Rulebook p.320).",
      )}
      {earned(
        "glory",
        "GLORY · AWARDS",
        "For particularly impressive feats (Core Rulebook p.316). The book prints no amount: you set it.",
      )}
      <div className="field">
        <span className="label">SPENDS · PLANNED</span>
        {lines.spends.map((s, i) => (
          <div key={i} className="keys" style={{ alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }} role="group" aria-label={`Spend ${i + 1} pool`}>
              {SPEND_POOLS.map((p) => (
                <button
                  key={p}
                  className={`btn sm ${s.pool === p ? "primary" : ""}`}
                  aria-pressed={s.pool === p}
                  onClick={() => setSpend(i, { pool: p })}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <NumberInput
              value={s.cost}
              label={`Spend ${i + 1}, cost`}
              max={MAX_POOL_STEP}
              onChange={(cost) => setSpend(i, { cost })}
            />
            <input
              className="input"
              style={{ flex: "1 1 160px", width: "auto" }}
              aria-label={`Spend ${i + 1} name`}
              placeholder="Name"
              maxLength={100}
              value={s.name}
              onChange={(e) => setSpend(i, { name: e.target.value })}
            />
            <input
              className="input"
              style={{ flex: "2 1 240px", width: "auto" }}
              aria-label={`Spend ${i + 1} effect`}
              placeholder="What it does"
              maxLength={500}
              value={s.text}
              onChange={(e) => setSpend(i, { text: e.target.value })}
            />
            <button
              className="btn sm danger"
              aria-label={`Remove spend ${i + 1}`}
              onClick={() => onChange({ ...lines, spends: lines.spends.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        <div className="keys" style={{ alignItems: "center" }}>
          <button
            className="btn sm"
            disabled={lines.spends.length >= MAX_POOL_LINES}
            onClick={() =>
              onChange({ ...lines, spends: [...lines.spends, { pool: "ruin", name: "", cost: 1, text: "" }] })
            }
          >
            + SPEND
          </button>
          <span className="dim" style={{ fontSize: 12 }}>
            Spend Ruin to escalate the scene, never to punish anyone (Core Rulebook p.320).
          </span>
        </div>
      </div>
    </>
  );
}
