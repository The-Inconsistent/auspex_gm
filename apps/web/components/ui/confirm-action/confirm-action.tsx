"use client";
import { useState } from "react";

type ConfirmActionProps = {
  label: string; // the button, and what it names for a screen reader
  prompt: string; // what happens, said once the button is armed
  confirmLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
};

// A destructive tap asks once: the button turns into the question with CONFIRM and CANCEL. Nothing times out or
// relies on blur, since a phone's Safari never focuses a tapped button.
export function ConfirmAction({
  label,
  prompt,
  confirmLabel = "CONFIRM",
  busy,
  disabled,
  onConfirm,
}: ConfirmActionProps) {
  const [armed, setArmed] = useState(false);

  // CONFIRM: disarms, then runs the action.
  const handleConfirm = () => {
    setArmed(false);
    void onConfirm();
  };

  if (!armed)
    return (
      <button className="btn sm danger" disabled={disabled} aria-busy={busy} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  return (
    <span className="confirm" role="group" aria-label={label}>
      <span className="red">{prompt}</span>
      <button className="btn sm danger" onClick={handleConfirm}>
        {confirmLabel}
      </button>
      <button className="btn sm" onClick={() => setArmed(false)}>
        CANCEL
      </button>
    </span>
  );
}
