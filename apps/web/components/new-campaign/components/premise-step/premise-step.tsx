"use client";
import { useState } from "react";

import type { FrameworkCatalogue } from "@wg/shared";

import { FrameworkPicker } from "@/components/gm/party/components/framework-picker/framework-picker";

import type { Draft } from "../../constants";

type Premise = Pick<Draft, "framework" | "frameworkBonus" | "patron">;
type PremiseStepProps = Premise & {
  catalogue: FrameworkCatalogue;
  tier: number;
  onChange: (patch: Partial<Premise>) => void;
};

// PREMISE: the Framework, "a sentence or two" saying who the Agents are, what they do and their shared goal (Core p.18).
// PARTY's picker fills in the printed names only (rules-flow §11.80); players see all three under MISSION.
export function PremiseStep({ catalogue, tier, framework, frameworkBonus, patron, onChange }: PremiseStepProps) {
  const [picking, setPicking] = useState(false);

  // START FROM A FRAMEWORK › USE: the picked names fill the fields, and the list closes.
  const use = (picked: { patron: string; framework: string }) => {
    onChange(picked);
    setPicking(false);
  };

  return (
    <>
      <div className="rule">WHAT&apos;S THE CAMPAIGN ABOUT?</div>
      <div className="field">
        <label className="label" htmlFor="nc-framework">
          FRAMEWORK · WHO THE AGENTS ARE, WHAT THEY DO, THEIR SHARED GOAL (P.18)
        </label>
        <textarea
          id="nc-framework"
          className="input"
          maxLength={5000}
          placeholder="A Deathwatch Kill Team hunting the cult beneath the dig site…"
          value={framework}
          onChange={(e) => onChange({ framework: e.target.value })}
        />
      </div>
      <div className="keys" style={{ alignItems: "center" }}>
        <button
          className={`btn ${picking ? "primary" : ""}`}
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          START FROM A FRAMEWORK
        </button>
        <i className="dim">Typing your own works too.</i>
      </div>
      {picking && (
        <FrameworkPicker
          catalogue={catalogue}
          tier={tier}
          patron={patron}
          onUse={use}
          onClose={() => setPicking(false)}
        />
      )}
      <div className="field">
        <label className="label" htmlFor="nc-patron">
          PATRON · OPTIONAL (PP.310–313)
        </label>
        <input
          id="nc-patron"
          className="input"
          maxLength={200}
          value={patron}
          onChange={(e) => onChange({ patron: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="nc-bonus">
          FRAMEWORK BONUS · OPTIONAL (P.19)
        </label>
        <textarea
          id="nc-bonus"
          className="input"
          maxLength={1000}
          value={frameworkBonus}
          onChange={(e) => onChange({ frameworkBonus: e.target.value })}
        />
      </div>
      <div className="fw-phone">
        <span className="label">A PHONE SHOWS</span> <b>MISSION</b> {framework.trim() || "nothing yet"}
        {patron.trim() && (
          <>
            {" "}
            · <b>PATRON</b> {patron}
          </>
        )}
      </div>
    </>
  );
}
