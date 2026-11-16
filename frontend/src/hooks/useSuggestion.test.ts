// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { suggestionStore } from '../lib/suggestionStore';
import type { GameState, Order, PressMessage, Unit } from '../types/diplomacy';
import {
  finishedOrders,
  type SuggestionBoardOptions,
  useSuggestionBoard,
} from './useSuggestion';

const unit = (id: string, power: Unit['power'], province: string): Unit => ({
  id,
  power,
  unit_type: 'A',
  province,
});
const UNITS = [
  unit('FRA_A_PAR', 'FRANCE', 'PAR'),
  unit('GER_A_MUN', 'GERMANY', 'MUN'),
  unit('ENG_A_LVP', 'ENGLAND', 'LVP'),
];
const move = (u: Unit, target: string | null): Order => ({
  unit_id: u.id,
  power: u.power,
  unit_type: 'A',
  origin: u.province,
  order_type: 'MOVE',
  target,
  via_convoy: false,
  is_explicit: true,
});
const game = (extra: Partial<GameState> = {}): GameState =>
  ({
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    units: UNITS,
    orders: {},
    winner: null,
    ...extra,
  }) as GameState;
const TURN = 'Spring 1901 Movement';
const message = (extra: Partial<PressMessage> = {}): PressMessage => ({
  id: 'm1',
  seq: 1,
  sender: 'GERMANY',
  anonymous: false,
  recipients: ['FRANCE'],
  body: '',
  sent_at: '2026-11-14T00:00:00Z',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  orders: [move(UNITS[0], 'BUR'), move(UNITS[1], 'RUH')],
  ...extra,
});

const board = (options: Partial<SuggestionBoardOptions> = {}) =>
  renderHook((props: SuggestionBoardOptions) => useSuggestionBoard(props), {
    initialProps: {
      gameState: game(),
      power: 'FRANCE',
      blocked: false,
      ...options,
    },
  });

beforeEach(() => suggestionStore.reset());

describe('useSuggestionBoard', () => {
  it('is null while no suggestion is on the map', () => {
    expect(board().result.current).toBeNull();
  });

  it('holds a draft: the staged orders, plain holds elsewhere, and who can be ordered', () => {
    const { result } = board();
    act(() => suggestionStore.startDraft(['GERMANY'], TURN));
    act(() => result.current?.stage(move(UNITS[1], 'BUR')));
    const draft = result.current;
    expect(draft?.mode).toBe('draft');
    expect(draft?.label).toBe('your suggestion to Germany');
    expect(draft?.map.editablePowers).toEqual(['FRANCE', 'GERMANY']);
    expect([...(draft?.map.unitIds ?? [])]).toEqual(['GER_A_MUN']);
    expect(draft?.orders.GER_A_MUN.target).toBe('BUR');
    expect(draft?.orders.FRA_A_PAR).toMatchObject({
      order_type: 'HOLD',
      is_explicit: false,
    });
    expect(draft?.count).toBe(1);
  });

  it('stages nothing for a power outside the thread', () => {
    const { result } = board();
    act(() => suggestionStore.startDraft(['GERMANY'], TURN));
    act(() => result.current?.stage(move(UNITS[2], 'WAL')));
    expect(result.current?.count).toBe(0);
  });

  it("shows a received suggestion read-only, with the player's own part to take", () => {
    const { result } = board();
    act(() => suggestionStore.view(message()));
    const view = result.current;
    expect(view?.mode).toBe('view');
    expect(view?.label).toBe("Germany's suggestion");
    expect(view?.map.editablePowers).toBeNull();
    expect(view?.count).toBe(2);
    expect(view?.mine.map((o) => o.unit_id)).toEqual(['FRA_A_PAR']);
  });

  it('leaves out an order whose unit has moved or gone', () => {
    const { result } = board({
      gameState: game({ units: [unit('FRA_A_PAR', 'FRANCE', 'GAS')] }),
    });
    act(() => suggestionStore.view(message()));
    expect(result.current?.count).toBe(0);
  });

  it('ends when the turn resolves', () => {
    const { result, rerender } = board();
    act(() => suggestionStore.startDraft(['GERMANY'], TURN));
    expect(result.current).not.toBeNull();
    rerender({
      gameState: game({ season: 'Fall' }),
      power: 'FRANCE',
      blocked: false,
    });
    expect(result.current).toBeNull();
    expect(suggestionStore.getState().draft).toBeNull();
  });

  it('ends when the board is needed for something else, or the phase is not Movement', () => {
    const blocked = board({ blocked: true });
    act(() => suggestionStore.view(message()));
    expect(blocked.result.current).toBeNull();
    expect(suggestionStore.getState().viewing).toBeNull();
    blocked.unmount();

    const retreats = board({ gameState: game({ phase: 'Retreats' }) });
    act(() => suggestionStore.view(message({ phase: 'Retreats', orders: [] })));
    expect(retreats.result.current).toBeNull();
  });

  it('never shows a suggestion made for an earlier turn', () => {
    const { result } = board({ gameState: game({ season: 'Fall' }) });
    act(() => suggestionStore.view(message()));
    expect(result.current).toBeNull();
  });

  it('ends when the game screen is left', () => {
    const { unmount } = board();
    act(() => suggestionStore.startDraft(['GERMANY'], TURN));
    unmount();
    expect(suggestionStore.getState().draft).toBeNull();
  });

  it('restricts anonymous backchannel drafts to only the recipient units', () => {
    const { result } = board();
    act(() => suggestionStore.startDraft(['GERMANY'], TURN, true));
    expect(result.current?.map.editablePowers).toEqual(['GERMANY']);
    expect(result.current?.label).toBe('your anonymous suggestion to Germany');

    act(() => {
      result.current?.stage(move(UNITS[0], 'BUR')); // France's own unit: ignored
      result.current?.stage(move(UNITS[1], 'BUR')); // Germany's unit: accepted
    });
    expect(Object.keys(suggestionStore.getState().draft?.orders ?? {})).toEqual(
      [UNITS[1].id],
    );
  });

  it('labels an anonymous backchannel suggestion without claiming it is yours', () => {
    const { result } = board();
    act(() =>
      suggestionStore.view(
        message({ sender: null, anonymous: true, recipients: ['FRANCE'] }),
      ),
    );
    expect(result.current?.label).toBe('anonymous suggestion');
  });
});

describe('finishedOrders', () => {
  it('keeps only the orders that are complete', () => {
    const done = move(UNITS[0], 'BUR');
    const open = move(UNITS[1], null);
    expect(finishedOrders({ a: done, b: open })).toEqual([done]);
  });
});
