import { describe, expect, it } from 'vitest';
import type { PhaseTimer } from '../types/diplomacy';
import {
  clockPillLabel,
  countVotes,
  formatClock,
  formatMinutes,
  powerNames,
  powersNotReady,
  powersYetToVote,
  timerOptions,
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
  vote_minutes: [15, 20, 30],
  host_paused: false,
};

describe('timerHelpers', () => {
  it('shows minutes and seconds, rounding up so 0:00 means time is out', () => {
    expect(formatClock(900)).toBe('15:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0.2)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('shows hours and days once a host sets a long clock', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(2 * 3600 + 4 * 60 + 5)).toBe('2:04:05');
    expect(formatClock(3 * 86400 + 3600)).toBe('3d 1:00:00');
  });

  it('offers the lengths the vote opened with, shortest first, then pause', () => {
    expect(timerOptions({ vote_minutes: [90, 10] })).toEqual([
      { choice: '10', label: '10 min' },
      { choice: '90', label: '1 h 30 min' },
      { choice: 'pause', label: 'Pause' },
    ]);
    expect(formatMinutes(120)).toBe('2 h');
  });

  it('names a long length by its two biggest units, rounding down', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(3099)).toBe('2 d 3 h');
    expect(formatMinutes(12351)).toBe('8 d 13 h');
    expect(formatMinutes(2880)).toBe('2 d');
    expect(formatMinutes(1439)).toBe('23 h 59 min');
  });

  it('says when the host paused the clock', () => {
    expect(
      clockPillLabel(
        { ...timer, stage: 'paused', host_paused: true },
        null,
        false,
      ),
    ).toBe('Paused by host');
  });

  it('names the turn the way the server does', () => {
    expect(turnLabel({ season: 'Spring', year: 1901, phase: 'Movement' })).toBe(
      'Spring 1901 Movement',
    );
    expect(turnLabel({ season: 'Spring', year: 1901, phase: 'Admin' })).toBe(
      'Spring 1901 — Admin Edit',
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
