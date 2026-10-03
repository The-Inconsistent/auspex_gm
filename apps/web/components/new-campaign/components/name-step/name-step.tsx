import type { FormEvent } from "react";

import { startingXp } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { STEP_LABELS } from "@/components/ui/wizard-steps/constants";
import type { FieldErrors } from "@/hooks/use-field-errors/use-field-errors";

import { CREATE_FORM, type Draft, type NewStep } from "../../constants";

type NameStepProps = {
  draft: Draft;
  error: string | null;
  fields: FieldErrors; // NAME is required (CreateGame)
  onName: (name: string) => void;
  onEdit: (step: NewStep) => void;
  onCreate: (e: FormEvent<HTMLFormElement>) => void;
};

// NAME, and everything the steps before asked, to check once before CREATE.
export function NameStep({ draft, error, fields, onName, onEdit, onCreate }: NameStepProps) {
  const rows: [label: string, value: string, edit: NewStep | null][] = [
    ["TIER", `${draft.tier} · ${startingXp(draft.tier)} XP`, "tier"],
    ["FRAMEWORK", draft.framework.trim(), "premise"],
    ["PATRON", draft.patron.trim(), null],
    ["BONUS", draft.frameworkBonus.trim(), null],
    ["KIND OF GAME", draft.kind.join(" · "), "table"],
    ["LEAVE OUT", draft.limits.join(" · "), null],
  ];
  return (
    <form id={CREATE_FORM} className="stack" onSubmit={onCreate}>
      <div className="rule">NAME THE CAMPAIGN</div>
      <div className="field">
        <label className="label" htmlFor="nc-name">
          NAME
        </label>
        <input
          id="nc-name"
          className="input"
          maxLength={100}
          placeholder="VOLKUS DIG SITE"
          value={draft.name}
          onChange={(e) => onName(e.target.value)}
          {...fields.marks("name")}
        />
        <FieldError {...fields.reason("name")} />
      </div>
      <div className="rule">REVIEW</div>
      {rows.map(([label, value, edit]) => (
        <div key={label} className="fw-line" style={{ alignItems: "center" }}>
          <span className="label">{label}</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{value || <i className="dim">none yet</i>}</span>
            {edit && (
              <button
                type="button"
                className="btn sm"
                aria-label={`Edit ${STEP_LABELS[edit]}`}
                onClick={() => onEdit(edit)}
              >
                EDIT
              </button>
            )}
          </span>
        </div>
      ))}
      {error && (
        <div className="red" role="alert">
          ! {error}
        </div>
      )}
      <i className="dim">Nothing is saved until CREATE. You become its GM.</i>
    </form>
  );
}
