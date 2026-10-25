import type { ReactNode } from "react";

type BookBoxProps = { title?: string; id?: string; label: string; children: ReactNode };

// One box of the book's character sheet (Core pp.40–41): its title centred over the quill rule and ornament, the box
// split from the one above by an iron rule. A box with no title (CONVICTION · RESOLVE · SPEED) is just the rule.
export function BookBox({ title, id, label, children }: BookBoxProps) {
  return (
    <section className="bs-box" id={id} aria-label={label}>
      {title && (
        <>
          <h2 className="bs-bh">{title}</h2>
          <i className="bs-qr" aria-hidden="true" />
        </>
      )}
      {children}
    </section>
  );
}
