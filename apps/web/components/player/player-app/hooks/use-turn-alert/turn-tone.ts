import { TURN_TONE } from "./constants";

// One AudioContext for the page. iOS keeps it suspended until a user gesture resumes it, so unlockTurnTone runs on a
// tap; until then playTurnTone does nothing and the flash is the alert.
let audio: AudioContext | null = null;

// Creates and resumes the context; must run inside a user gesture. Unsupported or refused just means no tone.
export async function unlockTurnTone() {
  try {
    audio ??= new AudioContext();
    // Not just "suspended": Safari parks it as "interrupted" after a call, a lock or an app switch.
    if (audio.state !== "running") await audio.resume();
  } catch {
    // no Web Audio, or the browser refused: the flash and vibration still work
  }
}

// Plays the two-note tone, or skips silently while the context isn't running. The iOS ringer switch may still mute it.
export function playTurnTone() {
  const ctx = audio;
  if (ctx?.state !== "running") return;
  const { notes, noteSeconds, peak } = TURN_TONE;
  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * noteSeconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    // A fast attack and an exponential tail, so the note doesn't click on or off.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteSeconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + noteSeconds);
  });
}
