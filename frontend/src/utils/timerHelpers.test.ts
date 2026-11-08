import { describe, expect, it } from 'vitest';
import { PhaseTimer } from '../types/diplomacy';
import {
  countVotes,
  formatClock,
  powerNames,
  powersNotReady,
  powersYetToVote,
  turnLabel,
} from './timerHelpers';

const timer: PhaseTimer = {
  stage: 'voting',
  deadline: 0,
  minutes: null,
  players: ['FRANCE', 'ENGLAND', 'ITALY'],
  votes: { FRANCE: '15', ITALY: '15' },
  extend_requests: [],
  ready_powers: ['ENGLAND'],
  remaining_seconds: 42,
  extensions_needed: 3,
};

describe('timerHelpers', () => {
  it('shows minutes and seconds, rounding up so 0:00 means time is out', () => {
    expect(formatClock(900)).toBe('15:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0.2)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('names the turn the way the server does', () => {
    expect(turnLabel({ season: 'Spring', year: 1901, phase: 'Movement' })).toBe(
      'Spring 1901 Movement',
    );
  });

  it('finds who has not voted or readied up', () => {
    expect(powersYetToVote(timer)).toEqual(['ENGLAND']);
    expect(powersNotReady(timer)).toEqual(['FRANCE', 'ITALY']);
  });

  it('counts votes for an option', () => {
    expect(countVotes(timer, '15')).toBe(2);
    expect(countVotes(timer, 'pause')).toBe(0);
  });

  it('lists powers by name', () => {
    expect(powerNames(['FRANCE', 'ITALY'])).toBe('France, Italy');
  });
});
