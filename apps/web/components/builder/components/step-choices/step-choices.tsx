"use client";
import type { BuildStep } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { citeLabel } from "../../utils";
import { ChoiceCard } from "../choice-card/choice-card";

type StepChoicesProps = { step: BuildStep; title?: string };

// A screen's grant choices (answered or not) and what is wrong on it, with page cites.
export function StepChoices({ step, title = "CHOICES" }: StepChoicesProps) {
  const { resolved: r } = useBuilder();
  const prompts = r?.choices.filter((c) => c.step === step) ?? [];
  const problems = r?.problems.filter((p) => p.step === step) ?? [];
  if (!prompts.length && !problems.length) return null;
  return (
    <section className="stack">
      {problems.length > 0 && (
        <ul className="bld-problems" role="list">
          {problems.map((p, i) => (
            <li key={i} className={p.severity === "gm" ? "gm" : "bad"}>
              <span className="label">{p.severity === "gm" ? "GM" : "!"}</span> {p.what}
              {p.cite && <span className="dim"> · {citeLabel(p.cite)}</span>}
            </li>
          ))}
        </ul>
      )}
      {prompts.length > 0 && <div className="rule">{title}</div>}
      {prompts.map((p) => (
        <ChoiceCard key={p.path} prompt={p} />
      ))}
    </section>
  );
}
