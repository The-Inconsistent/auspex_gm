import type { ReactNode } from "react";

type StorySectionProps = {
  label?: string; // omitted when the child draws its own heading (Tests, Ruin & Glory, Hazards)
  name: string; // what the pencil's accessible name opens: "Edit <name>"
  onEdit: () => void;
  children: ReactNode;
};

// One part of a scene spread, with a small pencil that opens just that part in the editor.
export function StorySection({ label, name, onEdit, children }: StorySectionProps) {
  return (
    <section className="story-sec">
      <button className="btn sm story-pencil" aria-label={`Edit ${name}`} onClick={onEdit}>
        ✎
      </button>
      {label && <span className="label">{label}</span>}
      {children}
    </section>
  );
}
