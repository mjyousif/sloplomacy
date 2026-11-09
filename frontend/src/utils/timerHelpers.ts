import {
  type GameState,
  type PhaseTimer,
  POWER_METADATA,
  type Power,
  type TimerChoice,
} from '../types/diplomacy';

export const TIMER_OPTIONS: { choice: TimerChoice; label: string }[] = [
  { choice: '15', label: '15 min' },
  { choice: '20', label: '20 min' },
  { choice: '30', label: '30 min' },
  { choice: 'pause', label: 'Pause' },
];

/** Identifies a turn to the server, which refuses orders meant for one that has resolved. */
export function turnLabel(
  state: Pick<GameState, 'season' | 'year' | 'phase'>,
): string {
  return `${state.season} ${state.year} ${state.phase}`;
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
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

export function powerNames(powers: Power[]): string {
  return powers.map((power) => POWER_METADATA[power].shortName).join(', ');
}
