"use client";
import { sourceCite, type Wargear } from "@wg/shared";

import { wargearLabels } from "@/lib/wargear-label/wargear-label";

type WargearNameProps = {
  id: string;
  name: string;
  wargearId: string | null;
  catalogue: Wargear[];
  onChange: (v: { name: string; wargearId: string | null }) => void;
};

// An item's NAME, which searches the Wargear catalogue (issue #51): picking an entry links it, so GIVE builds the
// profile and cite from the book; anything else typed keeps the name as a custom item. A native datalist, as the
// requisition form's ITEM is.
export function WargearName({ id, name, wargearId, catalogue, onChange }: WargearNameProps) {
  const { labelOf, find } = wargearLabels(catalogue);
  const linked = catalogue.find((w) => w.id === wargearId);
  // Typing: a label that names an entry links it; the name stays as typed until then.
  const handleInput = (v: string) => {
    const w = find(v);
    onChange(w ? { name: w.name, wargearId: w.id } : { name: v, wargearId: null });
  };
  return (
    <>
      <input
        id={id}
        className="input"
        list={`${id}-catalogue`}
        // The name alone, never the cite-carrying label, so an edit can't save the cite into it.
        value={name}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Search the Wargear chapter, or name a custom item"
      />
      <datalist id={`${id}-catalogue`}>
        {catalogue.map((w) => (
          <option
            key={w.id}
            value={labelOf(w)}
          >{`${w.kind} · ${sourceCite(w)}${w.value === null ? "" : ` · Value ${w.value}`}`}</option>
        ))}
      </datalist>
      <span className="dim">
        {linked ? (
          <>
            LINKED: {linked.name} · {sourceCite(linked)}{" "}
            <button className="btn sm" onClick={() => onChange({ name, wargearId: null })}>
              NO LINK
            </button>
          </>
        ) : (
          "CUSTOM: no catalogue profile"
        )}
      </span>
    </>
  );
}
