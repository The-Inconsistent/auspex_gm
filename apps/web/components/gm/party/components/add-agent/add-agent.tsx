"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { CharacterName, type ActionResult } from "@wg/shared";

import { NEW_CHARACTER } from "@/components/builder/constants";
import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

type AddAgentProps = { campaignId: string; send: Send; onResult: (r: ActionResult, ok: string) => void };

// ADD AGENT (a name, a blank sheet) and NEW FROM BUILDER (the builder's `new` page).
export function AddAgent({ campaignId, send, onResult }: AddAgentProps) {
  const [name, setName] = useState("");
  const fields = useFieldErrors("new-agent"); // ADD AGENT's name

  // ADD AGENT: creates a character with the typed name.
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const named = fields.check(CharacterName, name);
    if (named === null) return;
    onResult(await send({ type: "character.create", name: named }), `${named.toUpperCase()} ADDED`);
    setName("");
  };

  return (
    <div className="stack">
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={handleAdd}>
        <input
          id="new-agent"
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          aria-label="New character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NEW AGENT NAME"
          {...fields.marks()}
        />
        <button className="btn">ADD AGENT</button>
        <Link className="btn" href={`/c/${campaignId}/build/${NEW_CHARACTER}`}>
          NEW FROM BUILDER
        </Link>
      </form>
      <FieldError {...fields.reason()} />
    </div>
  );
}
