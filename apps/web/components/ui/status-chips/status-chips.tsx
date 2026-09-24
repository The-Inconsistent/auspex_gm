type StatusChipsProps = { items: string[] };

export function StatusChips({ items }: StatusChipsProps) {
  return (
    <>
      {items.map((s) => (
        <span key={s} className={`chip ${/Slain|Dead|Dying/.test(s) ? "bad" : "warn"}`}>{s.toUpperCase()}</span>
      ))}
    </>
  );
}
