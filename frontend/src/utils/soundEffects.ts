/**
 * Lightweight Web Audio API chimes for background-tab notifications.
 *
 * Uses synthesized tones scheduled directly on `AudioContext.currentTime` so
 * there are no external audio assets to load and no `setTimeout` delays that
 * browsers throttle in hidden tabs.
 */

export type AttentionChimeKind = 'turn' | 'vote';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (sharedAudioCtx && sharedAudioCtx.state !== 'closed') {
    return sharedAudioCtx;
  }
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  try {
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Creates or resumes the shared `AudioContext` during a user gesture so later
 * background-tab chimes are permitted by browser autoplay policies.
 */
export function unlockAudio(): boolean {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  return ctx.state === 'running';
}

/**
 * Registers one-time gesture listeners to unlock `AudioContext` on the player's
 * first interaction. Returns a cleanup function.
 */
export function setupAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleGesture = () => {
    const running = unlockAudio();
    if (running) {
      cleanup();
    }
  };

  const cleanup = () => {
    window.removeEventListener('pointerdown', handleGesture);
    window.removeEventListener('keydown', handleGesture);
  };

  window.addEventListener('pointerdown', handleGesture, { passive: true });
  window.addEventListener('keydown', handleGesture, { passive: true });
  return cleanup;
}

const CHIME_NOTES: Record<AttentionChimeKind, readonly [number, number]> = {
  // Pleasant major third (C5 -> E5) for a new turn requiring orders
  turn: [523.25, 659.25],
  // Distinct fourth-interval chime (G4 -> C5) for a phase-length vote
  vote: [392.0, 523.25],
};

function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/**
 * Plays a short two-note chime. No-ops gracefully when Web Audio is unavailable
 * or blocked by autoplay policy.
 */
export async function playAttentionChime(
  kind: AttentionChimeKind = 'turn',
): Promise<boolean> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') return false;

    const [firstFreq, secondFreq] = CHIME_NOTES[kind];
    const now = ctx.currentTime;
    scheduleTone(ctx, firstFreq, now, 0.18, 0.12);
    scheduleTone(ctx, secondFreq, now + 0.13, 0.28, 0.12);
    return true;
  } catch {
    return false;
  }
}

/** Test-only helper to clear the cached singleton AudioContext. */
export function _resetAudioContextForTests(): void {
  sharedAudioCtx = null;
}
