import type { ReactNode } from "react";

type HeadingProps = { title: string; id?: string; aside?: ReactNode };

// A section head: crimson small caps and the books' spiked rule. `id` is the jump strip's anchor; `aside` sits at the
// right end (a count, an EDIT button).
export function Heading({ title, id, aside }: HeadingProps) {
  return (
    <div className="ps-h2" id={id}>
      <h2>{title}</h2>
      <i aria-hidden="true" />
      {aside}
    </div>
  );
}
