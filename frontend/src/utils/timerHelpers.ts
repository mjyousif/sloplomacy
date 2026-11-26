import type { PhaseTimer, Power, TimerChoice } from '../types/diplomacy';

export { formatPowerList as powerNames } from './powerHelpers';
export { turnLabel } from './turnFormat';

/**
 * A length in minutes in its two biggest units: "45 min", "1 h 30 min", "2 d 3 h". Over a day
 * the minutes are dropped (rounded down), so a label never claims more time than there is.
 */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const hours = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(m / (24 * 60));
  const hours = Math.floor((m % (24 * 60)) / 60);
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

/** Over a day out, the clock shows when it ends instead of ticking. */
export const LONG_CLOCK_SECONDS = 24 * 60 * 60;

/** When a far-off clock runs out: "Fri 21:30" within the week, "Dec 4 21:30" beyond it. */
export function formatDeadline(at: Date, now: Date = new Date()): string {
  const time = at.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const days = (at.getTime() - now.getTime()) / 86_400_000;
  const day =
    days < 6
      ? at.toLocaleDateString([], { weekday: 'short' })
      : at.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} ${time}`;
}

/** What a vote offers, shortest first and the pause last. */
export function timerOptions(
  timer: Pick<PhaseTimer, 'vote_minutes'>,
): { choice: TimerChoice; label: string }[] {
  const minutes = [...(timer.vote_minutes ?? [15, 20, 30])].sort(
    (a, b) => a - b,
  );
  return [
    ...minutes.map((m) => ({
      choice: String(m) as TimerChoice,
      label: formatMinutes(m),
    })),
    { choice: 'pause' as TimerChoice, label: 'Pause' },
  ];
}

/** "4:05", or "2:04:05" once a host has set a clock an hour or more out, or "3d 2:04:05". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const ss = String(seconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${ss}`;
  const mm = String(totalMinutes % 60).padStart(2, '0');
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}:${mm}:${ss}`;
  const days = Math.floor(totalHours / 24);
  return `${days}d ${totalHours % 24}:${mm}:${ss}`;
}

/**
 * The phone's collapsed turn clock: one short line that says what the clock is doing. Tapping
 * the pill opens the full widget.
 */
export function clockPillLabel(
  timer: PhaseTimer | null,
  seconds: number | null,
  isHost: boolean,
): string {
  const clock = seconds === null ? '--:--' : formatClock(seconds);
  if (!timer) return isHost ? 'Start the clock' : 'No clock yet';
  if (timer.stage === 'voting') return `Vote · ${clock}`;
  if (
    timer.stage === 'running' &&
    seconds !== null &&
    seconds > LONG_CLOCK_SECONDS
  )
    return `Ends ${formatDeadline(new Date(Date.now() + seconds * 1000))}`;
  if (timer.stage === 'paused' && timer.host_paused) return 'Paused by host';
  if (timer.stage === 'paused')
    return `Paused · ${timer.ready_powers.length}/${timer.players.length} ready`;
  return clock;
}

export function powersYetToVote(timer: PhaseTimer): Power[] {
  return timer.players.filter((power) => !timer.votes[power]);
}

export function powersNotReady(timer: PhaseTimer): Power[] {
  return timer.players.filter((power) => !timer.ready_powers.includes(power));
}

export function countVotes(timer: PhaseTimer, choice: TimerChoice): number {
  return Object.values(timer.votes).filter((vote) => vote === choice).length;
}
