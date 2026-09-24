type RefusalProps = { error: string | null; onDismiss: () => void };

// Why the server refused the last tap, pinned to the bottom so it's visible wherever the button was.
export function Refusal({ error, onDismiss }: RefusalProps) {
  if (!error) return null;
  return (
    <div className="refusal" role="alert">
      <span>! {error}</span>
      <button className="btn" onClick={onDismiss}>
        OK
      </button>
    </div>
  );
}
