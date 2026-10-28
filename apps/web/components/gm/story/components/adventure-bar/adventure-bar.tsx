"use client";
import { useState, type FormEvent } from "react";

import { AdventureStatus, CodexSave, type ActionResult, type Codex, type LiveState } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import { AgentObjectives } from "@/components/gm/agent-objectives/agent-objectives";
import { ADVENTURE_STATUS } from "@/components/gm/prep/constants";
import { objectivesAt } from "@/lib/scene/scene";
import type { Adventure } from "../../types";

type AdventureBarProps = {
  codex: Codex;
  characters: LiveState["characters"]; // for the missions the GM tied to this adventure (§11.163)
  adv: Adventure | null;
  send: Send;
  onPick: (id: string) => void;
  onReport: (r: ActionResult, ok: string) => void;
};

// The adventure bar, as PREP has it: switch or start an adventure, its brief and premise, its mission status, and
// whether the party has it (issue #196).
export function AdventureBar({ codex, characters, adv, send, onPick, onReport }: AdventureBarProps) {
  const [title, setTitle] = useState("");
  const [advDraft, setAdvDraft] = useState<{ title: string; premise: string; brief: string } | null>(null); // adventure being edited
  const newFields = useFieldErrors("adv-new"); // the new adventure's title
  const advFields = useFieldErrors("adv-"); // the open adventure's

  // Adventure tab: switch adventure and close any open editor.
  const pickAdventure = (id: string) => {
    setAdvDraft(null);
    onPick(id);
  };

  // New adventure form: creates it and switches to it.
  const handleCreateAdventure = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const named = newFields.check(CodexSave.adventure.shape.title, title);
    if (named === null) return;
    const r = await send({ type: "codex.save", kind: "adventure", data: { title: named } });
    onReport(r, "ADVENTURE CREATED");
    if (r.ok && r.id) pickAdventure(r.id);
    setTitle("");
  };

  // SAVE on the adventure: keeps its status and SHOWN (codex.save would reset them to the defaults) and closes the editor.
  const saveAdventure = async () => {
    if (!adv || !advDraft) return;
    const data = advFields.check(CodexSave.adventure, { ...advDraft, status: adv.status, shown: adv.shown });
    if (!data) return;
    const r = await send({ type: "codex.save", kind: "adventure", id: adv.id, data });
    onReport(r, "ADVENTURE SAVED");
    if (r.ok) setAdvDraft(null);
  };

  // EDIT on the adventure: its title, brief and premise, with no marks left from an earlier SAVE.
  const editAdventure = (a: { title: string; premise: string; brief: string }) => {
    advFields.reset();
    setAdvDraft({ title: a.title, premise: a.premise, brief: a.brief });
  };

  // The status picker and SHOWN / HIDDEN: save the adventure with one field changed (the mission log, issue #196).
  const saveAdventureWith = async (patch: { status: AdventureStatus } | { shown: boolean }, ok: string) => {
    if (!adv) return;
    const { id, beats: _, ...row } = adv;
    onReport(await send({ type: "codex.save", kind: "adventure", id, data: { ...row, ...patch } }), ok);
  };

  // The status picker: PLANNED, ACTIVE, DONE or FAILED.
  const pickStatus = (value: string) => {
    if (!adv) return;
    const status = AdventureStatus.parse(value);
    saveAdventureWith({ status }, `${adv.title.toUpperCase()} → ${ADVENTURE_STATUS[status]}`);
  };

  return (
    <>
      <div className="keys">
        {codex.adventures.map((a) => (
          <button
            key={a.id}
            className={`btn ${a.id === adv?.id ? "primary" : ""}`}
            aria-pressed={a.id === adv?.id}
            onClick={() => pickAdventure(a.id)}
          >
            {a.title.toUpperCase()}
            {a.shown && " · SHOWN"}
          </button>
        ))}
        <form style={{ display: "flex", gap: 6 }} onSubmit={handleCreateAdventure}>
          <input
            id="adv-new"
            className="input"
            aria-label="New adventure title"
            placeholder="NEW ADVENTURE"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...newFields.marks()}
          />
          <button className="btn" aria-label="Create adventure">
            +
          </button>
        </form>
      </div>
      <FieldError {...newFields.reason()} />

      {!adv && (
        <p className="dim">
          Create an adventure, then plan its scenes: briefing, travel, investigation, social, combat, revelation, rest.
        </p>
      )}

      {adv &&
        (advDraft ? (
          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="adv-title">
                TITLE
              </label>
              <input
                id="adv-title"
                className="input"
                value={advDraft.title}
                onChange={(e) => setAdvDraft({ ...advDraft, title: e.target.value })}
                {...advFields.marks("title")}
              />
              <FieldError {...advFields.reason("title")} />
            </div>
            <div className="field">
              <label className="label" htmlFor="adv-brief">
                BRIEF (THE PARTY SEES THIS ONCE SHOWN)
              </label>
              <input
                id="adv-brief"
                className="input"
                maxLength={300}
                placeholder="Find out who sold the Sanctorum's seals"
                value={advDraft.brief}
                onChange={(e) => setAdvDraft({ ...advDraft, brief: e.target.value })}
                {...advFields.marks("brief")}
              />
              <FieldError {...advFields.reason("brief")} />
            </div>
            <div className="field">
              <label className="label" htmlFor="adv-premise">
                PREMISE / GM NOTES
              </label>
              <textarea
                id="adv-premise"
                className="input"
                value={advDraft.premise}
                onChange={(e) => setAdvDraft({ ...advDraft, premise: e.target.value })}
              />
            </div>
            <div className="keys">
              <button className="btn sm primary" onClick={saveAdventure}>
                SAVE
              </button>
              <button className="btn sm" onClick={() => setAdvDraft(null)}>
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <>
            {adv.brief && (
              <div>
                <span className="label accent">BRIEF</span> {adv.brief}
              </div>
            )}
            {/* The premise holds the hidden truth, so it stays closed like the scenes' GM notes. */}
            {adv.premise && (
              <details className="field plate">
                <summary className="label">PREMISE · TAP TO REVEAL</summary>
                <pre className="text">{adv.premise}</pre>
              </details>
            )}
            <AgentObjectives rows={objectivesAt(characters, { adventureId: adv.id })} />
            <div className="keys">
              <button className="btn sm" onClick={() => editAdventure(adv)}>
                EDIT ADVENTURE
              </button>
              <select
                className="input"
                aria-label="Mission status"
                style={{ width: "auto" }}
                value={adv.status}
                onChange={(e) => pickStatus(e.target.value)}
              >
                {AdventureStatus.options.map((s) => (
                  <option key={s} value={s}>
                    {ADVENTURE_STATUS[s]}
                  </option>
                ))}
              </select>
              {/* Whether the party has this mission in INTEL's MISSION LOG; it needs a brief first (§11.150). */}
              <button
                className="btn sm"
                style={{ color: adv.shown ? "var(--ink)" : "var(--red)" }}
                onClick={() =>
                  saveAdventureWith({ shown: !adv.shown }, adv.shown ? "HIDDEN FROM THE PARTY" : "SHOWN TO THE PARTY")
                }
              >
                {adv.shown ? "SHOWN TO THE PARTY" : "HIDDEN FROM THE PARTY"}
              </button>
            </div>
          </>
        ))}
    </>
  );
}
