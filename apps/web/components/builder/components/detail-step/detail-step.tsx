"use client";
import { useState } from "react";

import { LANGUAGE_XP, MAX_BOUGHT_WEALTH, WEALTH_XP } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { toggle } from "../../utils";
import { StepChoices } from "../step-choices/step-choices";

// Adding detail (Core pp.30–38): the name, languages (p.31, rules-flow.md §11.48–50) and Wealth (p.38, §11.51).
export function DetailStep() {
  const { draft, update, resolved: r, lookups, tier, go } = useBuilder();
  const [writeIn, setWriteIn] = useState("");
  const languages = [...lookups.languages.values()];
  const keywords = r?.sheet.keywords ?? [];
  const picks = draft.languages?.picks ?? [];
  const bought = draft.languages?.bought ?? [];
  const writeIns = [...picks, ...bought].filter((l) => !lookups.languages.has(l));

  // A language as a free pick, as a bought one (1 XP), or neither.
  const setLanguage = (id: string, as: "picks" | "bought") =>
    update((d) => {
      const l = { picks: d.languages?.picks ?? [], bought: d.languages?.bought ?? [] };
      const other = as === "picks" ? "bought" : "picks";
      return { ...d, languages: { ...l, [as]: toggle(l[as], id), [other]: l[other].filter((x) => x !== id) } };
    });

  // ADD (write-in): a language the table doesn't list, bought at 1 XP with the GM's agreement (§11.50).
  const addWriteIn = () => {
    const name = writeIn.trim();
    if (!name) return;
    setLanguage(name, "bought");
    setWriteIn("");
  };

  return (
    <div className="stack">
      <div className="rule">ADDING DETAIL</div>
      <div className="field">
        <label className="label" htmlFor="bld-name">
          NAME
        </label>
        <input
          id="bld-name"
          className="input"
          value={draft.name}
          maxLength={100}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
        />
      </div>

      <section className="stack">
        <div className="tbar">
          <span>LANGUAGES</span>
          <span>Core p.31</span>
        </div>
        <div className="dim">
          Everyone speaks Low Gothic. One more is free if a Keyword allows it; any other costs {LANGUAGE_XP} XP with the
          GM&apos;s agreement.
        </div>
        <div className="list table">
          {languages.map((l) => {
            const allowed = l.keywords.some((k) => keywords.includes(k));
            const free = picks.includes(l.id);
            const paid = bought.includes(l.id);
            return (
              <div key={l.id} className="bld-rate bld-lang">
                <span>
                  <b>{l.name}</b>
                  <span className="dim bld-cite">
                    {" "}
                    {l.keywords.join(", ")}
                    {l.xenos ? " · xenos" : ""}
                  </span>
                </span>
                <button
                  className={`btn sm ${free ? "primary" : ""}`}
                  aria-pressed={free}
                  aria-label={`${l.name} as your free language`}
                  disabled={!allowed && !free}
                  onClick={() => setLanguage(l.id, "picks")}
                >
                  FREE
                </button>
                <button
                  className={`btn sm ${paid ? "primary" : ""}`}
                  aria-pressed={paid}
                  aria-label={`Buy ${l.name} for ${LANGUAGE_XP} XP`}
                  onClick={() => setLanguage(l.id, "bought")}
                >
                  {LANGUAGE_XP} XP
                </button>
              </div>
            );
          })}
          {writeIns.map((l) => (
            <div key={l} className="bld-rate bld-lang">
              <span>
                <b>{l}</b> <span className="dim bld-cite">written in · GM approves</span>
              </span>
              <span />
              <button className="btn sm" aria-label={`Remove ${l}`} onClick={() => setLanguage(l, "bought")}>
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="keys">
          <input
            className="input"
            style={{ flex: "1 1 200px", width: "auto" }}
            aria-label="Another language"
            placeholder="Another language (T'au, a House tongue…)"
            value={writeIn}
            onChange={(e) => setWriteIn(e.target.value)}
          />
          <button className="btn" onClick={addWriteIn}>
            ADD
          </button>
        </div>
      </section>

      <section className="stack">
        <div className="tbar">
          <span>WEALTH</span>
          <span>Core p.38</span>
        </div>
        <div className="keys" style={{ alignItems: "center" }}>
          <span className="bld-v">{r?.sheet.wealth ?? tier + (draft.wealth ?? 0)}</span>
          <span className="dim" style={{ flex: "1 1 200px" }}>
            Starts at your Tier ({tier}); up to {MAX_BOUGHT_WEALTH} more at {WEALTH_XP} XP each.
          </span>
          <button
            className="btn sq"
            aria-label="Buy less Wealth"
            disabled={!draft.wealth}
            onClick={() => update((d) => ({ ...d, wealth: Math.max(0, (d.wealth ?? 0) - 1) }))}
          >
            −
          </button>
          <button
            className="btn sq"
            aria-label="Buy 1 Wealth"
            disabled={(draft.wealth ?? 0) >= MAX_BOUGHT_WEALTH}
            onClick={() => update((d) => ({ ...d, wealth: (d.wealth ?? 0) + 1 }))}
          >
            +
          </button>
        </div>
      </section>

      <StepChoices step="detail" />
      <div>
        <button className="btn primary" onClick={() => go("review")}>
          NEXT: REVIEW
        </button>
      </div>
    </div>
  );
}
