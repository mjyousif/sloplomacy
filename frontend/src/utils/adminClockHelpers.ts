import type { PhaseTimer, TimerSettings } from '../types/diplomacy';
import { formatMinutes } from './timerHelpers';

/** A new match's clock lengths, before the host changes any. Mirrors `TimerSettings` defaults. */
export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  vote_minutes: [15, 20, 30],
  fixed_phase_minutes: 5,
  vote_window_seconds: 60,
};

export const MAX_CLOCK_MINUTES = 30 * 24 * 60;

/** A wall-clock time as the host reads it, e.g. "21:30" today or "Fri 21:30" later. */
export function formatEndTime(at: Date, now: Date = new Date()): string {
  const time = at.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (at.toDateString() === now.toDateString()) return time;
  const day = at.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day} ${time}`;
}

/** When the clock runs out, from the seconds the server said were left when it sent it. */
export function clockEndsAt(
  timer: PhaseTimer,
  receivedAt: number = Date.now(),
): Date | null {
  if (timer.remaining_seconds === null || timer.remaining_seconds === undefined)
    return null;
  return new Date(receivedAt + timer.remaining_seconds * 1000);
}

/** One line on what the clock is doing, for the host's Turn Clock section. */
export function adminClockStatus(
  timer: PhaseTimer | null | undefined,
  receivedAt: number = Date.now(),
): string {
  if (!timer) return 'Off. The match is untimed.';
  const ends = clockEndsAt(timer, receivedAt);
  const at = ends ? formatEndTime(ends, new Date(receivedAt)) : null;
  if (timer.stage === 'voting')
    return `Players are voting on the phase length until ${at}.`;
  if (timer.stage === 'running') {
    const left = Math.max(1, Math.round((timer.remaining_seconds ?? 0) / 60));
    return `Running: runs out at ${at} (${formatMinutes(left)} left).`;
  }
  if (timer.host_paused) return 'Paused by you. Only you can resume it.';
  return `Paused by the players' vote: ${timer.ready_powers.length}/${timer.players.length} ready.`;
}

/** The value a `datetime-local` input takes for a time in the browser's own zone. */
export function toLocalInputValue(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Reads the host's lengths form. Vote options turned Off are dropped. Returns an error message
 * instead when the lengths would be refused.
 */
export function parseTimerSettings(form: {
  voteMinutes: (number | null)[];
  fixedPhaseMinutes: number | null;
  voteWindowSeconds: string;
}): TimerSettings | string {
  const inRange = (m: number | null) =>
    m !== null && Number.isInteger(m) && m >= 1 && m <= MAX_CLOCK_MINUTES;
  const vote = form.voteMinutes.filter((m): m is number => m !== null);
  if (vote.length === 0) return 'Give the vote at least one length.';
  if (!vote.every(inRange))
    return 'Each vote length must be 1 minute to 30 days.';
  if (new Set(vote).size !== vote.length)
    return 'Vote lengths must all be different.';
  if (!inRange(form.fixedPhaseMinutes))
    return 'Retreats and Adjustments need 1 minute to 30 days.';
  const raw = form.voteWindowSeconds.trim();
  const window = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(window >= 15 && window <= 3600))
    return 'A vote must last 15 to 3600 seconds.';
  return {
    vote_minutes: [...vote].sort((a, b) => a - b),
    fixed_phase_minutes: form.fixedPhaseMinutes as number,
    vote_window_seconds: window,
  };
}
