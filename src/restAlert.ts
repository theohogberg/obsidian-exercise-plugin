import { Notice, Platform } from 'obsidian';

// What happens when a rest period ends: an Obsidian notice, a short beep, a vibration
// where supported (Android; iOS has no vibration API), and a system notification on
// desktop when Obsidian isn't focused. A plugin can't post real phone notifications, and
// mobile pauses plugins in the background, so on a phone this only works while
// Obsidian is open with the screen on.

let audio: AudioContext | null = null;

function audioContextClass(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Call from the tap that starts a rest. Browsers (iOS especially) only allow sound
 * that a user gesture unlocked, so the audio context is created/resumed here; on
 * desktop this is also when notification permission is asked for, once.
 */
export function primeRestAlert(): void {
  try {
    const Ctx = audioContextClass();
    if (Ctx && !audio) audio = new Ctx();
    void audio?.resume();
  } catch {
    audio = null;
  }
  if (Platform.isDesktopApp && 'Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function restOverAlert(message: string): void {
  new Notice(message);
  navigator.vibrate?.([200, 100, 200]);
  beep();
  if (Platform.isDesktopApp && 'Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
    new Notification('Gym', { body: message });
  }
}

/** Two short tones. Silent if the audio wasn't unlocked (or the phone is on silent). */
function beep(): void {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  for (const offset of [0, 0.25]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  }
}
