"use client";
import { useState } from "react";

import { ASCENSION_XP, TIERS, deriveStats, pcStatus, rankOf, type ActionResult, type Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { ASCEND_KINDS, type AscendKind } from "../../constants";

const MAX_TIER = TIERS[TIERS.length - 1]!; // the campaign Tier can't go past the last one (Core p.20)

type AscendPanelProps = {
  characters: Character[];
  tier: number;
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// ASCEND (Core pp.147–148): the group's Tier, raised for everyone at once (house rule §11.63). Experience Ascension is
// offered only when every character has earned 100 XP in this Tier; Milestone Ascension is always offered, because it is
// the GM's call, and gives every character 100 XP. The server re-checks all of it, so this screen only makes the choice
// clear — and, because a Tier changes every character's XP budget, asks for a second tap before it sends.
export function AscendPanel({ characters, tier, send, onResult }: AscendPanelProps) {
  const [waivePackage, setWaivePackage] = useState(false);
  const [arming, setArming] = useState<AscendKind | null>(null);
  const inTier = (c: Character) => c.xp - c.xpAtAscension; // XP earned since the group last Ascended
  // A Dead character is no longer one of the group, so it neither has to reach 100 XP nor holds the party back
  // (Core p.147, rules-flow.md §11.63). The server reads it the same way, so the button matches what it will allow.
  const dead = (c: Character) =>
    pcStatus(c, deriveStats({ stats: c.stats, overrides: c.overrides, tier })).includes("Dead");
  const group = characters.filter((c) => !dead(c));
  const ready = group.filter((c) => inTier(c) >= ASCENSION_XP);
  const everyone = group.length > 0 && ready.length === group.length;
  const atMax = tier >= MAX_TIER;

  // ASCEND: raises the campaign's Tier for the whole party. A refusal names the rule and shows on the report line.
  const ascend = async (kind: AscendKind) => {
    setArming(null);
    const waive = kind === "milestone" && waivePackage;
    onResult(
      await send({ type: "campaign.ascend", kind, waivePackage: waive }),
      `${ASCEND_KINDS[kind].label} · TIER ${tier + 1}${waive ? " · PACKAGE WAIVED" : ""}`,
    );
  };

  // One Ascension's controls: the first tap arms it, the second sends it.
  const controls = (kind: AscendKind, blocked: boolean) =>
    arming === kind ? (
      <>
        <button className="btn danger" onClick={() => ascend(kind)}>
          CONFIRM · EVERY AGENT TO TIER {tier + 1}
        </button>
        <button className="btn" onClick={() => setArming(null)}>
          CANCEL
        </button>
      </>
    ) : (
      <button className="btn" disabled={blocked} onClick={() => setArming(kind)}>
        {ASCEND_KINDS[kind].label}
      </button>
    );

  return (
    <section className="panel pad stack">
      <div className="rule">
        <span>ASCENSION</span>
        <span className="dim">Core pp.147–148</span>
      </div>
      <div className="dim">
        The party Ascends together: one Tier for the whole campaign (house rule §11.63). Tier {tier} now
        {atMax ? " — the highest there is." : `, Tier ${tier + 1} after.`}{" "}
        {!atMax && "Each character then takes one Ascension Package, or an Archetype Ascension, in the builder."}
      </div>

      {group.length === 0 ? (
        <div className="dim">{characters.length ? "No living agents to Ascend." : "No agents yet."}</div>
      ) : (
        <div>
          {group.map((c) => {
            const short = ASCENSION_XP - inTier(c);
            return (
              <div key={c.id} className="asc-row">
                <b className="who">{c.name.toUpperCase()}</b>
                <span className="dim">RANK {rankOf(c.xp)}</span>
                <span>
                  {inTier(c)} / {ASCENSION_XP} XP THIS TIER
                </span>
                <span className={short <= 0 ? "accent" : "dim"}>{short <= 0 ? "READY" : `${short} SHORT`}</span>
              </div>
            );
          })}
        </div>
      )}

      {(Object.keys(ASCEND_KINDS) as AscendKind[]).map((kind) => {
        const blocked = atMax || (kind === "experience" && !everyone);
        return (
          <div key={kind} className="stack" style={{ gap: 6 }}>
            <div className="label">
              {ASCEND_KINDS[kind].label} · {ASCEND_KINDS[kind].cite}
            </div>
            <div className="dim">{ASCEND_KINDS[kind].gist}</div>
            {/* The GM may waive this Ascension's package (Core p.148 step 2); the builder then stops asking for one. */}
            {kind === "milestone" && (
              <label className="asc-waive">
                <input
                  type="checkbox"
                  checked={waivePackage}
                  onChange={(e) => setWaivePackage(e.target.checked)}
                  disabled={atMax}
                />
                <span>Waive the Ascension Package for this Ascension (Core p.148 step 2)</span>
              </label>
            )}
            <div className="keys" style={{ paddingTop: 0, alignItems: "center" }}>
              {controls(kind, blocked)}
              {atMax ? (
                <span className="dim">Tier {MAX_TIER} is the top of the ladder.</span>
              ) : (
                kind === "experience" &&
                !everyone && (
                  <span className="dim">
                    {ready.length} of {group.length} ready: offered once every character has earned {ASCENSION_XP} XP in
                    Tier {tier}.
                  </span>
                )
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
