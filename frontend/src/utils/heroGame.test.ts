import { describe, expect, it } from 'vitest';
import { game, ME, seat } from '../components/lobby/lobby.testkit';
import type { MultiplayerGameSummary } from '../types/diplomacy';
import {
  deadlineLabel,
  describeMyGame,
  finalizedLabel,
  gameUrgency,
  myPowerIn,
  pickHeroGame,
  sortMyGames,
  supplyCenterCount,
} from './heroGame';

const mine = (over: Partial<MultiplayerGameSummary>) =>
  game({
    status: 'active',
    participants: { FRANCE: seat('FRANCE', 'me'), ITALY: seat('ITALY', 'u2') },
    ...over,
  });

const NOW = Date.parse('2026-11-15T12:00:00Z');
const inSeconds = (s: number) => NOW / 1000 + s;

describe('myPowerIn', () => {
  it('finds the seat the user holds, and none for a guest or a stranger', () => {
    expect(myPowerIn(mine({}), ME)).toBe('FRANCE');
    expect(myPowerIn(mine({}), null)).toBeNull();
    expect(myPowerIn(game({ participants: {} }), ME)).toBeNull();
  });
});

describe('gameUrgency', () => {
  it('is your move until you finalize, then waiting', () => {
    expect(gameUrgency(mine({}), ME)).toBe('your-move');
    expect(gameUrgency(mine({ finalized_powers: ['FRANCE'] }), ME)).toBe(
      'waiting',
    );
    // Someone else finalizing does not make it less your move.
    expect(gameUrgency(mine({ finalized_powers: ['ITALY'] }), ME)).toBe(
      'your-move',
    );
  });

  it('has nothing to ask of a surrendered power or of someone with no seat', () => {
    expect(gameUrgency(mine({ surrendered_powers: ['FRANCE'] }), ME)).toBe(
      'waiting',
    );
    expect(gameUrgency(game({ status: 'active' }), ME)).toBe('waiting');
  });

  it('calls a won or completed game finished, and a sandbox a sandbox', () => {
    expect(gameUrgency(mine({ status: 'completed' }), ME)).toBe('finished');
    expect(gameUrgency(mine({ winner: 'ITALY' }), ME)).toBe('finished');
    expect(gameUrgency(mine({ is_sandbox: true, winner: 'ITALY' }), ME)).toBe(
      'sandbox',
    );
  });
});

describe('sortMyGames and pickHeroGame', () => {
  const dueSoon = mine({ game_id: 'soon', deadline: inSeconds(600) });
  const dueLater = mine({ game_id: 'later', deadline: inSeconds(7200) });
  const untimedOld = mine({
    game_id: 'untimed_old',
    last_moved_at: '2026-11-10T00:00:00Z',
  });
  const untimedNew = mine({
    game_id: 'untimed_new',
    last_moved_at: '2026-11-14T00:00:00Z',
  });
  const waitingNew = mine({
    game_id: 'waiting_new',
    finalized_powers: ['FRANCE'],
    last_moved_at: '2026-11-15T00:00:00Z',
    deadline: inSeconds(60),
  });
  const waitingOld = mine({
    game_id: 'waiting_old',
    finalized_powers: ['FRANCE'],
    created_at: '2026-11-01T00:00:00Z',
  });
  const finished = mine({ game_id: 'finished', status: 'completed' });
  const sandbox = mine({ game_id: 'sandbox', is_sandbox: true });

  it('puts games waiting on you first by deadline, then the rest by last played', () => {
    const shuffled = [
      sandbox,
      waitingOld,
      finished,
      untimedOld,
      dueLater,
      waitingNew,
      untimedNew,
      dueSoon,
    ];
    expect(sortMyGames(shuffled, ME).map((g) => g.game_id)).toEqual([
      'soon',
      'later',
      'untimed_new',
      'untimed_old',
      'waiting_new',
      'waiting_old',
      'finished',
      'sandbox',
    ]);
    // The input is left as it was.
    expect(shuffled[0]).toBe(sandbox);
  });

  it('puts a game that has resolved a turn ahead of a newer one that has not started', () => {
    const fresh = mine({
      game_id: 'fresh',
      created_at: '2026-11-15T00:00:00Z',
    });
    expect(sortMyGames([fresh, untimedOld], ME).map((g) => g.game_id)).toEqual([
      'untimed_old',
      'fresh',
    ]);
    // A deadline still comes first.
    expect(
      sortMyGames([untimedOld, { ...fresh, deadline: inSeconds(60) }], ME).map(
        (g) => g.game_id,
      ),
    ).toEqual(['fresh', 'untimed_old']);
  });

  it('features the most pressing game', () => {
    expect(pickHeroGame([waitingNew, dueLater, dueSoon], ME)?.game_id).toBe(
      'soon',
    );
    expect(pickHeroGame([finished, waitingOld], ME)?.game_id).toBe(
      'waiting_old',
    );
  });

  it('features a finished game only when nothing else is left, and never a sandbox', () => {
    expect(pickHeroGame([sandbox, finished], ME)?.game_id).toBe('finished');
    expect(pickHeroGame([sandbox], ME)).toBeNull();
    expect(pickHeroGame([], ME)).toBeNull();
  });
});

describe('supplyCenterCount', () => {
  it('counts supply centers only, not the other provinces a power colours', () => {
    const ownership = {
      PAR: 'FRANCE',
      MAR: 'FRANCE',
      BUR: 'FRANCE', // not a supply center
      MUN: 'GERMANY',
    } as const;
    expect(supplyCenterCount(ownership, 'FRANCE')).toBe(2);
    expect(supplyCenterCount(ownership, 'GERMANY')).toBe(1);
    expect(supplyCenterCount(ownership, 'ITALY')).toBe(0);
    expect(supplyCenterCount(undefined, 'FRANCE')).toBe(0);
  });
});

describe('deadlineLabel', () => {
  it('says how long the running clock has left', () => {
    expect(deadlineLabel(null, NOW)).toBeNull();
    expect(deadlineLabel(undefined, NOW)).toBeNull();
    expect(deadlineLabel(inSeconds(-5), NOW)).toBe('Due now');
    expect(deadlineLabel(inSeconds(90), NOW)).toBe('Due in 2 min');
    expect(deadlineLabel(inSeconds(59 * 60), NOW)).toBe('Due in 59 min');
    expect(deadlineLabel(inSeconds(14 * 3600 + 120), NOW)).toBe('Due in 14h');
    expect(deadlineLabel(inSeconds(3 * 86400 + 60), NOW)).toBe('Due in 3 days');
  });
});

describe('finalizedLabel', () => {
  it('counts the seated powers that have not surrendered', () => {
    const three = mine({
      participants: {
        FRANCE: seat('FRANCE', 'me'),
        ITALY: seat('ITALY', 'u2'),
        RUSSIA: seat('RUSSIA', 'u3'),
      },
      finalized_powers: ['ITALY'],
    });
    expect(finalizedLabel(three)).toBe('1 of 3 finalized');
    expect(finalizedLabel({ ...three, surrendered_powers: ['RUSSIA'] })).toBe(
      '1 of 2 finalized',
    );
  });
});

describe('describeMyGame', () => {
  it('words a game that is waiting on you', () => {
    expect(
      describeMyGame(
        mine({ season: 'Fall', year: 1902, phase: 'Retreats' }),
        ME,
        NOW,
      ),
    ).toEqual({
      urgency: 'your-move',
      power: 'FRANCE',
      status: 'Your move',
      turn: 'Fall 1902 · Retreats',
      enterLabel: 'Resume as France',
      leaveLabel: 'Surrender & Leave',
    });
  });

  it('words a lobby that has not started, a waiting game, and a sandbox', () => {
    const lobby = describeMyGame(mine({ status: 'waiting' }), ME, NOW);
    expect(lobby.leaveLabel).toBe('Leave');
    const waiting = describeMyGame(
      mine({ finalized_powers: ['FRANCE'] }),
      ME,
      NOW,
    );
    expect(waiting.status).toBe('Waiting on others');
    expect(waiting.enterLabel).toBe('Resume as France');
    const sandbox = describeMyGame(mine({ is_sandbox: true }), ME, NOW);
    expect(sandbox).toMatchObject({
      status: 'Saved sandbox',
      enterLabel: 'Open sandbox',
      leaveLabel: 'Delete',
    });
  });

  it('words a finished game before and after the player has seen the result', () => {
    const unseen = describeMyGame(mine({ status: 'completed' }), ME, NOW);
    expect(unseen).toMatchObject({
      status: 'Finished · see the result',
      enterLabel: 'Review board',
    });
    const seen = describeMyGame(
      mine({
        status: 'completed',
        participants: {
          FRANCE: {
            ...seat('FRANCE', 'me'),
            game_over_seen_at: new Date(NOW - 3 * 3600 * 1000).toISOString(),
          },
        },
      }),
      ME,
      NOW,
    );
    expect(seen.status).toBe('Finished · archives in 21h');
  });

  it('falls back to France when the player holds no seat', () => {
    expect(describeMyGame(game({ is_sandbox: true }), ME, NOW).power).toBe(
      'FRANCE',
    );
  });
});
