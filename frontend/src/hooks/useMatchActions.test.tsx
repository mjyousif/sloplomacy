// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameState,
  Order,
  PhaseTimer,
  ValidationIssue,
} from '../types/diplomacy';
import { type MatchActionsOptions, useMatchActions } from './useMatchActions';

const supabase = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);

const TIMER = { deadline: '2026-11-10T12:00:00Z' } as unknown as PhaseTimer;
const state = (over: Partial<GameState> = {}) =>
  ({
    game_id: 'mp_1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    timer: TIMER,
    ...over,
  }) as GameState;
const ISSUE = {
  power: 'FRANCE',
  severity: 'warning',
  unit_ids: ['F_A_PAR'],
  provinces: ['BUR'],
} as unknown as ValidationIssue;
const frenchMove = {
  unit_id: 'F_A_PAR',
  power: 'FRANCE',
  order_type: 'MOVE',
} as unknown as Order;
const germanMove = {
  unit_id: 'G_A_MUN',
  power: 'GERMANY',
  order_type: 'MOVE',
} as unknown as Order;

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

let opts: MatchActionsOptions;
function makeOptions(
  over: Partial<MatchActionsOptions> = {},
): MatchActionsOptions {
  return {
    viewMode: 'multiplayer',
    activeGameId: 'mp_1',
    lockedPower: 'FRANCE',
    gameState: state(),
    playerPower: 'FRANCE',
    directEditActive: false,
    sandboxMode: false,
    sandboxGameId: null,
    draftGameId: 'mp_1',
    requireRealBoard: vi.fn(() => true),
    setHypotheticalMatchTimer: vi.fn(),
    triggerToast: vi.fn(),
    setSelectedUnitId: vi.fn(),
    applyServerState: vi.fn(),
    fetchGamesList: vi.fn(async () => {}),
    ...over,
  };
}

/** The one request the hook sent, with its parsed body. */
function sent(index = 0) {
  const [url, init] = supabase.authedFetch.mock.calls[index];
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(init.body) : undefined,
  };
}

beforeEach(() => {
  supabase.authedFetch.mockReset();
  supabase.authedFetch.mockResolvedValue(reply(200, state()));
  opts = makeOptions();
});

function renderActions(o: MatchActionsOptions = opts) {
  return renderHook((props: MatchActionsOptions) => useMatchActions(props), {
    initialProps: o,
  });
}

describe('useMatchActions: orders', () => {
  it('sends an order to the draft game with the turn it was given on', async () => {
    const next = state({ season: 'Fall' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const { result } = renderActions(makeOptions({ draftGameId: 'sbx_9' }));
    await act(() => result.current.handleUpdateOrder(frenchMove));
    expect(sent()).toEqual({
      url: '/api/order?game_id=sbx_9',
      method: 'POST',
      body: { order: frenchMove, turn: 'Spring 1901 Movement' },
    });
    expect(opts.triggerToast).not.toHaveBeenCalled();
  });

  it('puts the board the server sends back on the map', async () => {
    const next = state({ season: 'Fall' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleUpdateOrder(frenchMove));
    expect(o.applyServerState).toHaveBeenCalledWith(next);
  });

  it('refuses a foreign order in a match until Hypothetical Mode or Direct-Edit is on', async () => {
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleUpdateOrder(germanMove));
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Enable "Sandbox Pre-Moves" to plot hypothetical orders for foreign powers.',
    );
  });

  it.each([
    ['in Hypothetical Mode', { sandboxMode: true }],
    ['with Direct-Edit on', { directEditActive: true }],
    ['in a sandbox', { viewMode: 'sandbox' as const }],
    ['without a seat', { lockedPower: null }],
  ])('sends a foreign order %s', async (_label, over) => {
    const { result } = renderActions(makeOptions(over));
    await act(() => result.current.handleUpdateOrder(germanMove));
    expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
  });

  it('says why an order was refused, or that it was', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(400, { detail: 'No such province' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(409, {}));
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleUpdateOrder(frenchMove));
    await act(() => result.current.handleUpdateOrder(frenchMove));
    expect(o.triggerToast).toHaveBeenNthCalledWith(1, 'No such province');
    expect(o.triggerToast).toHaveBeenNthCalledWith(
      2,
      'That order was not accepted.',
    );
    expect(o.applyServerState).not.toHaveBeenCalled();
  });

  it('confirms every order of the player’s power on the draft game', async () => {
    const next = state({ phase: 'Retreats' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const o = makeOptions({ draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() => result.current.handleConfirmAllHolds());
    expect(sent()).toEqual({
      url: '/api/orders/confirm-all?game_id=sbx_9',
      method: 'POST',
      body: { power: 'FRANCE' },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(next);
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Confirmed all current orders for France.',
    );
  });

  it('confirms for the power on screen, which in a sandbox is not a seat', async () => {
    const { result } = renderActions(
      makeOptions({ viewMode: 'sandbox', lockedPower: null }),
    );
    await act(() => result.current.handleConfirmAllHolds());
    expect(sent().body).toEqual({ power: 'FRANCE' });
  });

  it('confirms nothing without a board, or when the server says no', async () => {
    const o = makeOptions({ gameState: null });
    const { result } = renderActions(o);
    await act(() => result.current.handleConfirmAllHolds());
    expect(supabase.authedFetch).not.toHaveBeenCalled();

    supabase.authedFetch.mockResolvedValue(reply(403, {}));
    const o2 = makeOptions();
    const second = renderActions(o2);
    await act(() => second.result.current.handleConfirmAllHolds());
    expect(o2.applyServerState).not.toHaveBeenCalled();
    expect(o2.triggerToast).not.toHaveBeenCalled();
  });
});

describe('useMatchActions: finalize', () => {
  it('finalizes on the real game with the turn, then refreshes the lobby', async () => {
    const next = state({ finalized_powers: ['FRANCE'] } as Partial<GameState>);
    supabase.authedFetch.mockResolvedValue(
      reply(200, { state: next, requires_confirmation: false, issues: [] }),
    );
    const o = makeOptions({ draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() => result.current.handleFinalizeClick());
    expect(sent()).toEqual({
      url: '/api/finalize?game_id=mp_1',
      method: 'POST',
      body: { power: 'FRANCE', force: false, turn: 'Spring 1901 Movement' },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(next);
    expect(o.triggerToast).toHaveBeenCalledWith(
      'French Republic orders locked & finalized!',
    );
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
    expect(result.current.sanityModalOpen).toBe(false);
  });

  it('opens the Sanity Check modal on problems, and closes it when forced through', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, {
        state: state(),
        requires_confirmation: true,
        issues: [ISSUE],
      }),
    );
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleFinalizeClick(false));
    expect(result.current.sanityModalOpen).toBe(true);
    expect(result.current.sanityModalIssues).toEqual([ISSUE]);
    expect(o.triggerToast).not.toHaveBeenCalled();
    expect(o.fetchGamesList).not.toHaveBeenCalled();

    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, { state: state(), requires_confirmation: false, issues: [] }),
    );
    await act(() => result.current.handleFinalizeClick(true));
    expect(sent(1).body.force).toBe(true);
    expect(result.current.sanityModalOpen).toBe(false);
  });

  it('closes the modal and says why when the server refuses', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, {
        state: state(),
        requires_confirmation: true,
        issues: [ISSUE],
      }),
    );
    supabase.authedFetch.mockResolvedValueOnce(
      reply(409, { detail: 'The turn has moved on.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleFinalizeClick());
    await act(() => result.current.handleFinalizeClick(true));
    expect(result.current.sanityModalOpen).toBe(false);
    expect(o.triggerToast).toHaveBeenLastCalledWith('The turn has moved on.');
    await act(() => result.current.handleFinalizeClick(true));
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Could not finalize your orders.',
    );
  });

  it('the modal can be closed from outside', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, {
        state: state(),
        requires_confirmation: true,
        issues: [ISSUE],
      }),
    );
    const { result } = renderActions();
    await act(() => result.current.handleFinalizeClick());
    act(() => result.current.setSanityModalOpen(false));
    expect(result.current.sanityModalOpen).toBe(false);
  });

  it('unlocks the real orders, then refreshes the lobby', async () => {
    const next = state({ season: 'Fall' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const o = makeOptions({ draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() => result.current.handleUnfinalizeClick());
    expect(sent()).toEqual({
      url: '/api/unfinalize?game_id=mp_1',
      method: 'POST',
      body: { power: 'FRANCE' },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(next);
    expect(o.triggerToast).toHaveBeenCalledWith('Orders unlocked for editing.');
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
  });

  it('does nothing real from a private sandbox, or without a board', async () => {
    const requireRealBoard = vi.fn(() => false);
    const { result } = renderActions(makeOptions({ requireRealBoard }));
    await act(() => result.current.handleFinalizeClick());
    await act(() => result.current.handleUnfinalizeClick());
    await act(() => result.current.handleAdjudicateTurn());
    expect(requireRealBoard.mock.calls).toEqual([
      ['finalize your real orders'],
      ['unlock your real orders'],
      ['resolve the real turn'],
    ]);

    const noBoard = renderActions(makeOptions({ gameState: null }));
    await act(() => noBoard.result.current.handleFinalizeClick());
    await act(() => noBoard.result.current.handleUnfinalizeClick());
    await act(() => noBoard.result.current.handleAdjudicateTurn());
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });
});

/** A button wired like the map's and the sheet's Resolve buttons. */
function ResolveButton({ o }: { o: MatchActionsOptions }) {
  const { handleAdjudicateTurn } = useMatchActions(o);
  return (
    <button type="button" onClick={handleAdjudicateTurn}>
      Resolve
    </button>
  );
}

describe('useMatchActions: resolve', () => {
  it('a double click resolves the turn once', async () => {
    let finish: (r: Response) => void = () => {};
    supabase.authedFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const o = makeOptions();
    render(<ResolveButton o={o} />);
    const user = userEvent.setup();
    await user.dblClick(screen.getByRole('button', { name: 'Resolve' }));
    expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(reply(200, state({ season: 'Fall' }))));
    // Once the first one is back, the next click resolves again.
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(supabase.authedFetch).toHaveBeenCalledTimes(2);
  });

  it('a failed resolve does not block the next one', async () => {
    supabase.authedFetch.mockRejectedValueOnce(new Error('offline'));
    const o = makeOptions();
    render(<ResolveButton o={o} />);
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(supabase.authedFetch).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('resolves the real game at the turn on screen, then says where it is now', async () => {
    const next = state({ season: 'Fall', phase: 'Movement' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const o = makeOptions({ draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() => result.current.handleAdjudicateTurn());
    expect(sent()).toEqual({
      url: '/api/adjudicate?game_id=mp_1&turn=Spring%201901%20Movement',
      method: 'POST',
      body: undefined,
    });
    expect(o.applyServerState).toHaveBeenCalledWith(next);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Turn resolved! Now in Fall 1901 (Movement Phase).',
    );
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
  });

  it('names the winner, and says why a resolve was refused', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ winner: 'GERMANY' } as Partial<GameState>)),
    );
    supabase.authedFetch.mockResolvedValueOnce(
      reply(409, { detail: 'Already resolved.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.handleAdjudicateTurn());
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'German Empire has won the game!',
    );
    await act(() => result.current.handleAdjudicateTurn());
    expect(o.triggerToast).toHaveBeenLastCalledWith('Already resolved.');
    await act(() => result.current.handleAdjudicateTurn());
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Could not resolve the turn.',
    );
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
  });
});

describe('useMatchActions: the turn clock', () => {
  it('posts a clock action for the real game and shows the board it sends back', async () => {
    const next = state({ season: 'Fall' });
    supabase.authedFetch.mockResolvedValue(reply(200, next));
    const o = makeOptions({ draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() =>
      result.current.postTimerAction('vote', {
        power: 'FRANCE',
        choice: 'pause',
      }),
    );
    expect(sent()).toEqual({
      url: '/api/games/mp_1/timer/vote',
      method: 'POST',
      body: { power: 'FRANCE', choice: 'pause' },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(next);
    expect(o.setHypotheticalMatchTimer).not.toHaveBeenCalled();
  });

  it('sends an empty body by default', async () => {
    const { result } = renderActions();
    await act(() => result.current.postTimerAction('start'));
    expect(sent().url).toBe('/api/games/mp_1/timer/start');
    expect(sent().body).toEqual({});
  });

  it('only moves the clock behind a private sandbox', async () => {
    const later = { deadline: '2026-11-10T13:00:00Z' } as unknown as PhaseTimer;
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ timer: later })),
    );
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ timer: undefined } as Partial<GameState>)),
    );
    const o = makeOptions({ sandboxGameId: 'sbx_9', draftGameId: 'sbx_9' });
    const { result } = renderActions(o);
    await act(() => result.current.postTimerAction('extend'));
    await act(() => result.current.postTimerAction('ready'));
    expect(o.setHypotheticalMatchTimer).toHaveBeenNthCalledWith(1, later);
    expect(o.setHypotheticalMatchTimer).toHaveBeenNthCalledWith(2, null);
    expect(o.applyServerState).not.toHaveBeenCalled();
  });

  it('says why the clock refused', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(403, { detail: 'Only the host can start the clock.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(400, {}));
    const o = makeOptions();
    const { result } = renderActions(o);
    await act(() => result.current.postTimerAction('start'));
    await act(() => result.current.postTimerAction('start'));
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Only the host can start the clock.'],
      ['The clock did not accept that.'],
    ]);
    expect(o.applyServerState).not.toHaveBeenCalled();
  });
});
