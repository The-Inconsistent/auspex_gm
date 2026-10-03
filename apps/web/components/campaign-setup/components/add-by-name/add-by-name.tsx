"use client";
import { useState, type FormEvent } from "react";

import { CodexSave } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import type { TypedKind } from "../../constants";

type AddByNameProps = {
  id: string;
  kind: TypedKind;
  send: Send;
  onError: (error: string | null) => void;
};

// OR TYPE ONE: a place or a faction by its name only; CODEX fills in the rest later.
export function AddByName({ id, kind, send, onError }: AddByNameProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = useFieldErrors(id);

  // ADD: one codex.save; an empty name is marked instead (CodexSave), and the field clears once the save lands.
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const named = fields.check(CodexSave[kind].shape.name, name);
    if (named === null) return;
    setBusy(true);
    const r = await send({ type: "codex.save", kind, data: { name: named } });
    setBusy(false);
    onError(r.ok ? null : r.error);
    if (r.ok) setName("");
  };

  return (
    <form className="field" onSubmit={handleAdd}>
      <label className="label" htmlFor={id}>
        OR TYPE ONE
      </label>
      <div className="keys" style={{ paddingTop: 0 }}>
        <input
          id={id}
          className="input"
          style={{ maxWidth: 360 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...fields.marks()}
        />
        <button className="btn" aria-busy={busy}>
          ADD
        </button>
      </div>
      <FieldError {...fields.reason()} />
    </form>
  );
}
