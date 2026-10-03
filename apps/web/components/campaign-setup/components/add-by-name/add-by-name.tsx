"use client";
import { useState, type FormEvent } from "react";

import type { ActionResult } from "@wg/shared";

type AddByNameProps = {
  id: string;
  max: number;
  onAdd: (name: string) => Promise<ActionResult>;
  onError: (error: string | null) => void;
};

// OR TYPE ONE: a place or a faction by its name only; CODEX fills in the rest later.
export function AddByName({ id, max, onAdd, onError }: AddByNameProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // ADD: one codex.save; the field clears once it lands.
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await onAdd(name.trim());
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
          maxLength={max}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" aria-busy={busy} disabled={!name.trim()}>
          ADD
        </button>
      </div>
    </form>
  );
}
