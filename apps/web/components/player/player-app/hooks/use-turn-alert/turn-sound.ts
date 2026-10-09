import { TURN_SOUND_KEY } from "./constants";

// The SOUND ON/OFF choice as a tiny external store, so useSyncExternalStore renders "off" on the server and the stored
// choice after hydration, without a mismatch. `memory` keeps the choice for this page when storage throws (private
// window, storage disabled).
let memory: boolean | null = null;
const listeners = new Set<() => void>();

export function readTurnSound(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(TURN_SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeTurnSound(on: boolean) {
  memory = on;
  try {
    localStorage.setItem(TURN_SOUND_KEY, on ? "on" : "off");
  } catch {
    // blocked storage: the choice holds until the page reloads
  }
  listeners.forEach((l) => l());
}

export function subscribeTurnSound(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
