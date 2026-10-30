"use client";
import { useState, type FormEvent } from "react";

import { AdventureStatus, CodexSave, type ActionResult, type Codex, type LiveState } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import { AgentObjectives } from "@/components/gm/agent-objectives/agent-objectives";
import { PartyDialog } from "@/components/gm/party/components/party-dialog/party-dialog";
import { ADVENTURE_STATUS } from "@/components/gm/prep/constants";
import { objectivesAt } from "@/lib/scene/scene";
import type { Adventure } from "../../types";
import { ImportAdventure } from "../import-adventure/import-adventure";

type AdventureBarProps = {
  campaignId: string;
  codex: Codex;
  characters: LiveState["characters"]; // for the missions the GM tied to this adventure (§11.163)
  adv: Adventure | null;
  send: Send;
  onPick: (id: string) => void;
  onReport: (r: ActionResult, ok: string) => void;
};

type Draft = Pick<Adventure, "title" | "brief" | "premise" | "status" | "shown">;

// The adventure, as the redesign has it (Flow-StoryBoard): one button with its title. It opens the one dialog that
// switches, starts, imports, edits and deletes adventures, so the page keeps the brief, premise and missions only.
export function AdventureBar({ campaignId, codex, characters, adv, send, onPick, onReport }: AdventureBarProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); // the new adventure's
  const [draft, setDraft] = useState<Draft | null>(null); // the open adventure's fields, from when the dialog opened
  const [error, setError] = useState<string | null>(null); // a refusal, shown in the dialog over the page's line
  const newFields = useFieldErrors("adv-new");
  const advFields = useFieldErrors("adv-");

  // Every result goes to the page's line too; a refusal also shows in the dialog, which covers that line.
  const report = (r: ActionResult, ok: string) => {
    onReport(r, ok);
    setError(r.ok ? null : r.error);
  };

  // The adventure button: the dialog, with the open adventure's fields as they are now.
  const show = () => {
    advFields.reset();
    setError(null);
    setDraft(adv && { title: adv.title, brief: adv.brief, premise: adv.premise, status: adv.status, shown: adv.shown });
    setOpen(true);
  };

  // A row in the list: switch adventure and close.
  const pick = (id: string) => {
    setOpen(false);
    onPick(id);
  };

  // NEW ADVENTURE: creates it and switches to it.
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const named = newFields.check(CodexSave.adventure.shape.title, title);
    if (named === null) return;
    const r = await send({ type: "codex.save", kind: "adventure", data: { title: named } });
    report(r, "ADVENTURE CREATED");
    if (r.ok && r.id) {
      setTitle("");
      pick(r.id);
    }
  };

  // SAVE: every field at once; SHOWN needs a brief, which the server checks (§11.150).
  const save = async () => {
    if (!adv || !draft) return;
    const data = advFields.check(CodexSave.adventure, draft);
    if (!data) return;
    const r = await send({ type: "codex.save", kind: "adventure", id: adv.id, data });
    report(r, "ADVENTURE SAVED");
    if (r.ok) setOpen(false);
  };

  // DELETE ADVENTURE: its scenes go with it, linked missions stay unlinked (§11.163); STORY then opens the next one.
  const remove = async () => {
    if (!adv) return;
    const r = await send({ type: "codex.delete", kind: "adventure", id: adv.id });
    report(r, "ADVENTURE DELETED");
    if (r.ok) setOpen(false);
  };

  return (
    <>
      <div className="keys">
        <button className="btn" aria-label={`Adventure: ${adv?.title ?? "none"}. Change adventure`} onClick={show}>
          {adv ? adv.title.toUpperCase() : "ADVENTURES"}
          {adv?.shown && " · SHOWN"} ▾
        </button>
      </div>

      {!adv && (
        <p className="dim">
          Create an adventure, then plan its scenes: briefing, travel, investigation, social, combat, revelation, rest.
        </p>
      )}

      {adv && (
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
        </>
      )}

      {open && (
        <PartyDialog label="Adventures" title="ADVENTURES" msg={null} onClose={() => setOpen(false)}>
          {error && (
            <div className="red" role="alert">
              ! {error}
            </div>
          )}
          {codex.adventures.length > 0 && (
            <div className="list">
              {codex.adventures.map((a) => (
                <button
                  key={a.id}
                  className={`btn ${a.id === adv?.id ? "primary" : ""}`}
                  aria-pressed={a.id === adv?.id}
                  onClick={() => pick(a.id)}
                >
                  {a.title.toUpperCase()} · {ADVENTURE_STATUS[a.status]}
                  {a.shown && " · SHOWN"}
                </button>
              ))}
            </div>
          )}
          <form style={{ display: "flex", gap: 6 }} onSubmit={create}>
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
          <FieldError {...newFields.reason()} />
          <ImportAdventure campaignId={campaignId} onReport={report} />

          {adv && draft && (
            <div className="stack">
              <div className="rule">{adv.title.toUpperCase()}</div>
              <div className="field">
                <label className="label" htmlFor="adv-title">
                  TITLE
                </label>
                <input
                  id="adv-title"
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
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
                  value={draft.brief}
                  onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
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
                  value={draft.premise}
                  onChange={(e) => setDraft({ ...draft, premise: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="adv-status">
                  MISSION STATUS
                </label>
                <select
                  id="adv-status"
                  className="input"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: AdventureStatus.parse(e.target.value) })}
                >
                  {AdventureStatus.options.map((s) => (
                    <option key={s} value={s}>
                      {ADVENTURE_STATUS[s]}
                    </option>
                  ))}
                </select>
              </div>
              {/* Whether the party has this mission in INTEL's MISSION LOG; it needs a brief first (§11.150). */}
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={draft.shown}
                  onChange={(e) => setDraft({ ...draft, shown: e.target.checked })}
                />
                SHOWN TO THE PARTY
              </label>
              <div className="keys">
                <button className="btn sm primary" onClick={save}>
                  SAVE
                </button>
                <ConfirmAction
                  label="DELETE ADVENTURE"
                  prompt={`Delete ${adv.title} and its ${adv.beats.length} ${adv.beats.length === 1 ? "scene" : "scenes"}? Missions tied to it stay with the Agents, unlinked.`}
                  onConfirm={remove}
                />
              </div>
            </div>
          )}
        </PartyDialog>
      )}
    </>
  );
}
