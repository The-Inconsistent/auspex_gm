type RoundNotesProps = {
  // The line under the strip: before Round 1 the head count, at a Round's end its reminders.
  head: string;
  items: string[];
};

// A Round's two quiet moments, before Round 1 (Steps 1–2, Core pp.176–177) and ROUND N COMPLETE (what lapses, p.177 and
// p.325). A note for the GM, never a gate: the key bar's BEGIN button is the only way on.
export function RoundNotes({ head, items }: RoundNotesProps) {
  return (
    <div className="round-notes" role="region" aria-label={head}>
      <span className="label">{head}</span>
      {items.length > 0 && (
        <ul>
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
