"use client";
import { useEffect } from "react";

import { PAUSE_VIBRATION } from "./constants";

type PauseBannerProps = { at: string | null; onDismiss: () => void };

// The pause card on the GM's tablet (issue #194, rules-flow §11.157): someone at the table asked to stop. On every tab,
// and it stays until DISMISS so it's never missed mid-sentence. It says "someone" because the server never knows more:
// no name, no count, no timer, and two taps close together show one banner.
export function PauseBanner({ at, onDismiss }: PauseBannerProps) {
  // External system: the device vibration motor (navigator.vibrate), where the browser has one. Each new signal buzzes.
  useEffect(() => {
    if (at) navigator.vibrate?.(PAUSE_VIBRATION);
  }, [at]);

  if (!at) return null;
  return (
    <div className="pause-banner" role="alert">
      <span>PAUSE · SOMEONE ASKED TO STOP. STOP THE SCENE AND CHECK IN WITH THE TABLE.</span>
      <button className="btn sm" onClick={onDismiss}>
        DISMISS
      </button>
    </div>
  );
}
