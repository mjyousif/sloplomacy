import { describe, expect, it } from 'vitest';
import type { LobbyGameRow, MultiplayerGameSummary } from '../types/diplomacy';
import {
  browseQuery,
  DEFAULT_BROWSE_FILTERS,
  hasActiveFilters,
  isRowJoinable,
  myPowerIn,
  pageCount,
  parseYear,
  relativeTime,
  seatState,
  shortDate,
  shortTurn,
  toggleCountry,
} from './lobbyBrowse';

const NOW = Date.parse('2026-11-11T12:00:00Z');

describe('browseQuery', () => {
  it('asks for the first page of open games by default', () => {
    expect(browseQuery(DEFAULT_BROWSE_FILTERS, 1)).toBe(
      'seats=open&page=1&page_size=10',
    );
  });

  it('sends countries and a complete turn filter', () => {
    const q = new URLSearchParams(
      browseQuery(
        {
          seats: 'all',
          countries: ['FRANCE', 'ITALY'],
          turnOp: 'after',
          season: 'Fall',
          year: 1903,
        },
        3,
      ),
    );
    expect(q.get('seats')).toBe('all');
    expect(q.get('countries')).toBe('FRANCE,ITALY');
    expect(q.get('turn_op')).toBe('after');
    expect(q.get('season')).toBe('Fall');
    expect(q.get('year')).toBe('1903');
    expect(q.get('page')).toBe('3');
  });

  it('leaves out a turn filter that has no year yet', () => {
    const q = new URLSearchParams(
      browseQuery({ ...DEFAULT_BROWSE_FILTERS, turnOp: 'at' }, 1),
    );
    expect(q.has('turn_op')).toBe(false);
  });

  it('compares years only without a season', () => {
    const q = new URLSearchParams(
      browseQuery({ ...DEFAULT_BROWSE_FILTERS, turnOp: 'at', year: 1905 }, 1),
    );
    expect(q.get('turn_op')).toBe('at');
    expect(q.has('season')).toBe(false);
  });
});

describe('hasActiveFilters', () => {
  it('ignores an unfinished turn filter', () => {
    expect(hasActiveFilters(DEFAULT_BROWSE_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_BROWSE_FILTERS, turnOp: 'at' })).toBe(
      false,
    );
    expect(hasActiveFilters({ ...DEFAULT_BROWSE_FILTERS, seats: 'all' })).toBe(
      true,
    );
  });
});

describe('small helpers', () => {
  it('pageCount is at least one page', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
  });

  it('toggleCountry adds and removes', () => {
    expect(toggleCountry(['FRANCE'], 'ITALY')).toEqual(['FRANCE', 'ITALY']);
    expect(toggleCountry(['FRANCE', 'ITALY'], 'FRANCE')).toEqual(['ITALY']);
  });

  it('parseYear takes whole years from 1901', () => {
    expect(parseYear('1903')).toBe(1903);
    expect(parseYear('1899')).toBeNull();
    expect(parseYear('')).toBeNull();
  });

  it('shortTurn abbreviates the season and phase', () => {
    expect(shortTurn('Fall', 1903, 'Movement')).toBe('F1903 Moves');
    expect(shortTurn('Winter', 1904, 'Adjustments')).toBe('W1904 Builds');
  });
});

describe('dates', () => {
  it('relativeTime counts up to a week, then shows the date', () => {
    expect(relativeTime('2026-11-11T11:59:30Z', NOW)).toBe('just now');
    expect(relativeTime('2026-11-11T11:48:00Z', NOW)).toBe('12m ago');
    expect(relativeTime('2026-11-11T07:00:00Z', NOW)).toBe('5h ago');
    expect(relativeTime('2026-11-08T12:00:00Z', NOW)).toBe('3d ago');
    expect(relativeTime('2026-10-20T12:00:00Z', NOW)).toBe('Oct 20');
    expect(relativeTime('not a date', NOW)).toBe('—');
  });

  it('shortDate adds the year only for another year', () => {
    expect(shortDate('2026-11-03T12:00:00Z', NOW)).toBe('Nov 3');
    expect(shortDate('2025-11-03T12:00:00Z', NOW)).toBe('Nov 3, 2025');
  });
});

describe('seats', () => {
  const row: LobbyGameRow = {
    game_id: 'mp_1',
    name: 'Table',
    status: 'active',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    host_name: 'Host',
    created_at: '2026-11-01T00:00:00Z',
    last_moved_at: '2026-11-01T00:00:00Z',
    claimed_powers: ['FRANCE', 'RUSSIA'],
    open_powers: ['AUSTRIA', 'ENGLAND', 'GERMANY', 'ITALY', 'TURKEY'],
  };

  it('seatState marks the player, the free seats and the rest', () => {
    expect(seatState(row, 'RUSSIA', 'RUSSIA')).toBe('mine');
    expect(seatState(row, 'FRANCE', 'RUSSIA')).toBe('taken');
    expect(seatState(row, 'ITALY', null)).toBe('free');
  });

  it('isRowJoinable needs a free seat in a game still running', () => {
    expect(isRowJoinable(row)).toBe(true);
    expect(isRowJoinable({ ...row, open_powers: [] })).toBe(false);
    expect(isRowJoinable({ ...row, status: 'completed' })).toBe(false);
  });

  it('myPowerIn reads the seat from the player own games only', () => {
    const mine = [
      {
        game_id: 'mp_1',
        participants: { RUSSIA: { user_id: 'u1', power: 'RUSSIA' } },
      },
    ] as unknown as MultiplayerGameSummary[];
    expect(myPowerIn('mp_1', mine, 'u1')).toBe('RUSSIA');
    expect(myPowerIn('mp_1', mine, 'u2')).toBeNull();
    expect(myPowerIn('mp_2', mine, 'u1')).toBeNull();
    expect(myPowerIn('mp_1', mine, null)).toBeNull();
  });
});
