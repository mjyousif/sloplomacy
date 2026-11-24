import type { PhaseTimer, Power, TimerChoice } from '../types/diplomacy';

export { formatPowerList as powerNames } from './powerHelpers';
export { turnLabel } from './turnFormat';

export const TIMER_OPTIONS: { choice: TimerChoice; label: string }[] = [
  { choice: '15', label: '15 min' },
  { choice: '20', label: '20 min' },
  { choice: '30', label: '30 min' },
  { choice: 'pause', label: 'Pause' },
];

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
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
