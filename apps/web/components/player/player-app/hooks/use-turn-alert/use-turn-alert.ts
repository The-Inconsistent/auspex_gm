import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { TURN_VIBRATION } from "../../constants";
import { TURN_FLASH_MS } from "./constants";
import { playTurnTone, unlockTurnTone } from "./turn-tone";
import { readTurnSound, subscribeTurnSound, writeTurnSound } from "./turn-sound";

// The turn alert (issue #207): when it becomes this Agent's turn, a flash (always), a buzz (where navigator.vibrate
// exists: not iOS) and a tone (if this phone turned SOUND on and a tap has unlocked audio). Each cue is gated on its
// own capability or preference.
export function useTurnAlert(myTurn: boolean) {
  const sound = useSyncExternalStore(subscribeTurnSound, readTurnSound, () => false);

  // The flash starts on the false → true flip, worked out during render, and ends after TURN_FLASH_MS, when the turn
  // ends, or on the player's next tap.
  const [flashing, setFlashing] = useState(false);
  const [wasMyTurn, setWasMyTurn] = useState(false);
  if (myTurn !== wasMyTurn) {
    setWasMyTurn(myTurn);
    setFlashing(myTurn);
  }

  // External systems: the vibration motor (navigator.vibrate) and Web Audio, once per new turn; plus the flash's timer.
  // The ref keeps Strict Mode's second dev run from buzzing and chiming twice when the page loads mid-turn.
  const cued = useRef(false);
  useEffect(() => {
    if (!myTurn) {
      cued.current = false;
      return;
    }
    if (!cued.current) {
      cued.current = true;
      navigator.vibrate?.(TURN_VIBRATION);
      // Read from the store, not `sound`, so toggling SOUND mid-turn doesn't re-run this and buzz again.
      if (readTurnSound()) playTurnTone();
    }
    const t = setTimeout(() => setFlashing(false), TURN_FLASH_MS);
    return () => clearTimeout(t);
  }, [myTurn]);

  // Any tap in the player app: unlock audio while SOUND is on (iOS needs a gesture first), and end the flash. pointerup,
  // not pointerdown: a touch's pointerdown isn't a user activation, so iOS wouldn't resume audio on it.
  const handleTap = () => {
    if (readTurnSound()) void unlockTurnTone();
    setFlashing(false);
  };

  // SOUND ON/OFF. Turning it on is itself the unlocking tap, and plays the tone once so the player hears what to expect.
  const toggleSound = async () => {
    writeTurnSound(!sound);
    if (sound) return;
    await unlockTurnTone();
    // Still on after the await: a quick ON then OFF plays nothing.
    if (readTurnSound()) playTurnTone();
  };

  return { flashing, sound, handleTap, toggleSound };
}
