import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, PressMessage } from '../types/diplomacy';
import { suggestionStore } from './suggestionStore';

const move = (unit_id: string, target: string): Order => ({
  unit_id,
  power: 'GERMANY',
  unit_type: 'A',
  origin: 'MUN',
  order_type: 'MOVE',
  target,
  via_convoy: false,
  is_explicit: false,
});

const TURN = 'Spring 1901 Movement';

beforeEach(() => suggestionStore.reset());

describe('suggestionStore', () => {
  it('starts a draft empty and stages one order for each unit', () => {
    suggestionStore.startDraft(['GERMANY'], TURN);
    expect(suggestionStore.getState().draft).toEqual({
      members: ['GERMANY'],
      turn: TURN,
      orders: {},
    });
    suggestionStore.stageOrder(move('GER_A_MUN', 'BUR'));
    suggestionStore.stageOrder(move('GER_A_MUN', 'RUH'));
    const orders = suggestionStore.getState().draft?.orders ?? {};
    expect(Object.keys(orders)).toEqual(['GER_A_MUN']);
    expect(orders.GER_A_MUN.target).toBe('RUH');
    // What is suggested is always an explicit order, a hold included.
    expect(orders.GER_A_MUN.is_explicit).toBe(true);
  });

  it('stages nothing when no draft is open', () => {
    suggestionStore.stageOrder(move('GER_A_MUN', 'BUR'));
    expect(suggestionStore.getState().draft).toBeNull();
  });

  it('takes an order off the draft', () => {
    suggestionStore.startDraft(['GERMANY'], TURN);
    suggestionStore.stageOrder(move('GER_A_MUN', 'BUR'));
    suggestionStore.removeOrder('GER_A_MUN');
    expect(suggestionStore.getState().draft?.orders).toEqual({});
  });

  it('holds a draft or a viewed message, never both', () => {
    const message = { id: 'm1', orders: [] } as unknown as PressMessage;
    suggestionStore.startDraft(['GERMANY'], TURN);
    suggestionStore.view(message);
    expect(suggestionStore.getState()).toEqual({
      draft: null,
      viewing: message,
      opening: null,
    });
    suggestionStore.startDraft(['GERMANY'], TURN);
    expect(suggestionStore.getState().viewing).toBeNull();
    suggestionStore.clear();
    expect(suggestionStore.getState()).toEqual({
      draft: null,
      viewing: null,
      opening: null,
    });
  });

  it('holds one opening preview at a time, in place of any suggestion', () => {
    const opening = {
      id: 'ita-lepanto',
      name: 'Lepanto Opening',
      power: 'ITALY' as const,
      turn: TURN,
      orders: [],
    };
    suggestionStore.startDraft(['GERMANY'], TURN);
    suggestionStore.previewOpening(opening);
    expect(suggestionStore.getState()).toEqual({
      draft: null,
      viewing: null,
      opening,
    });
    suggestionStore.view({ id: 'm1', orders: [] } as unknown as PressMessage);
    expect(suggestionStore.getState().opening).toBeNull();
  });

  it('sends an opening through the registered applier only', async () => {
    expect(await suggestionStore.applyOpening('ITALY', [])).toMatch(/cannot/);
    const calls: string[] = [];
    suggestionStore.setOpeningApplier(async (power) => {
      calls.push(power);
      return null;
    });
    expect(await suggestionStore.applyOpening('ITALY', [])).toBeNull();
    expect(calls).toEqual(['ITALY']);
  });

  it('tells its listeners, and takes orders through whoever holds the board', async () => {
    const listener = vi.fn();
    const stop = suggestionStore.subscribe(listener);
    suggestionStore.startDraft(['GERMANY'], TURN);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();

    expect(await suggestionStore.adopt([])).toMatch(/cannot be used/);
    const adopter = vi.fn(async () => null);
    suggestionStore.setAdopter(adopter);
    const orders = [move('GER_A_MUN', 'BUR')];
    expect(await suggestionStore.adopt(orders)).toBeNull();
    expect(adopter).toHaveBeenCalledWith(orders);
  });
});
