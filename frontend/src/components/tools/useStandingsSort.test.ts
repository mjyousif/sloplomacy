// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unitAt } from '../../test/mapFixtures';
import type { Power } from '../../types/diplomacy';
import { useStandingsSort } from './useStandingsSort';

const KEY = 'sloplomacy_standings_sort';

const order = (hook: ReturnType<typeof setup>) =>
  hook.result.current.displayedPowers.map((p) => p.power);

function setup(
  ownership: Record<string, Power>,
  units = [unitAt('FRANCE', 'A', 'PAR')],
) {
  return renderHook(() => useStandingsSort(ownership, units));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useStandingsSort: counts and ranking', () => {
  it('ranks by supply centres, highest first', () => {
    const hook = setup({
      PAR: 'FRANCE',
      BRE: 'FRANCE',
      MAR: 'FRANCE',
      LON: 'ENGLAND',
      BER: 'GERMANY',
      MUN: 'GERMANY',
    });
    expect(hook.result.current.sortMode).toBe('score');
    expect(order(hook).slice(0, 3)).toEqual(['FRANCE', 'GERMANY', 'ENGLAND']);
    expect(hook.result.current.displayedPowers[0]).toMatchObject({
      power: 'FRANCE',
      scCount: 3,
      rank: 1,
    });
  });

  it('breaks a supply centre tie by units, not counting dislodged ones', () => {
    const hook = setup({ PAR: 'FRANCE', LON: 'ENGLAND' }, [
      unitAt('ENGLAND', 'F', 'LON'),
      unitAt('ENGLAND', 'A', 'LVP'),
      unitAt('FRANCE', 'A', 'PAR'),
      unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true }),
    ]);
    const [first, second] = hook.result.current.displayedPowers;
    expect([first.power, second.power]).toEqual(['ENGLAND', 'FRANCE']);
    expect(first.unitCount).toBe(2);
    // The dislodged army is not counted
    expect(second.unitCount).toBe(1);
    expect([first.rank, second.rank]).toEqual([1, 2]);
  });

  it('breaks a full tie by the standard power order and gives equal ranks', () => {
    const hook = setup({}, []);
    expect(order(hook)).toEqual([
      'FRANCE',
      'ENGLAND',
      'GERMANY',
      'ITALY',
      'AUSTRIA',
      'RUSSIA',
      'TURKEY',
    ]);
    expect(hook.result.current.displayedPowers.map((p) => p.rank)).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('gives a later rank to the power after a tied pair', () => {
    const hook = setup(
      { A: 'AUSTRIA', B: 'AUSTRIA', E: 'ENGLAND', E2: 'ENGLAND', F: 'FRANCE' },
      [],
    );
    expect(
      hook.result.current.displayedPowers.slice(0, 3).map((p) => p.rank),
    ).toEqual([1, 1, 3]);
  });

  it('ignores centres owned by an unknown power', () => {
    const hook = setup({ PAR: 'NOBODY' as Power }, []);
    expect(
      hook.result.current.displayedPowers.reduce((n, p) => n + p.scCount, 0),
    ).toBe(0);
  });
});

describe('useStandingsSort: sort mode', () => {
  const ownership: Record<string, Power> = {
    LON: 'ENGLAND',
    LVP: 'ENGLAND',
    PAR: 'FRANCE',
  };

  it('lists the powers in standard order with no rank in default mode', () => {
    const hook = setup(ownership);
    act(() => hook.result.current.setSortMode('default'));
    expect(hook.result.current.sortMode).toBe('default');
    expect(order(hook)[0]).toBe('FRANCE');
    expect(
      hook.result.current.displayedPowers.every((p) => p.rank === null),
    ).toBe(true);
    expect(
      hook.result.current.displayedPowers.find((p) => p.power === 'ENGLAND'),
    ).toMatchObject({ scCount: 2, unitCount: 0 });
  });

  it('remembers the choice and starts from it next time', () => {
    const first = setup(ownership);
    act(() => first.result.current.setSortMode('default'));
    expect(localStorage.getItem(KEY)).toBe('default');
    first.unmount();
    expect(setup(ownership).result.current.sortMode).toBe('default');
    act(() => {});
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(KEY, 'sideways');
    expect(setup(ownership).result.current.sortMode).toBe('score');
  });

  it('still switches when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const hook = setup(ownership);
    expect(hook.result.current.sortMode).toBe('score');
    act(() => hook.result.current.setSortMode('default'));
    expect(hook.result.current.sortMode).toBe('default');
  });
});
