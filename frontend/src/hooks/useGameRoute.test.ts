// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../types/diplomacy';
import type { ViewMode } from '../utils/viewMode';
import { useGameRoute } from './useGameRoute';

const plainFetch = vi.fn();
vi.stubGlobal('fetch', plainFetch);

const ME: AuthUser = { id: 'me', email: 'me@test.com', displayName: 'Me' };
const summary = (over: Partial<MultiplayerGameSummary> = {}) =>
  ({
    game_id: 'mp_1',
    name: 'Linked',
    participants: { GERMANY: { power: 'GERMANY', user_id: 'bob' } },
    has_passcode: false,
    ...over,
  }) as unknown as MultiplayerGameSummary;
const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);

interface HarnessOptions {
  authUser?: AuthUser | null;
  authReady?: boolean;
  matchPasscodes?: Record<string, string>;
  viewMode?: ViewMode;
  leaveAllowed?: boolean;
}

/** The hook inside the bit of App state it reads, with the actions moving that state. */
function renderRoute(opts: HarnessOptions = {}) {
  const calls = {
    enterSeat: vi.fn(),
    watchGame: vi.fn(),
    leaveToLobby: vi.fn(),
    openSandbox: vi.fn(),
    triggerToast: vi.fn(),
  };
  const view = renderHook(
    ({ authReady }: { authReady: boolean }) => {
      const [viewMode, setViewMode] = useState<ViewMode>(
        opts.viewMode ?? 'lobby',
      );
      const [activeGameId, setActiveGameId] = useState('proto_1901');
      const open = (id: string) => {
        setActiveGameId(id);
        setViewMode('multiplayer');
      };
      const route = useGameRoute({
        viewMode,
        activeGameId,
        authUser: opts.authUser ?? null,
        authReady,
        matchPasscodes: opts.matchPasscodes ?? {},
        enterSeat: async (id: string, power: Power) => {
          calls.enterSeat(id, power);
          open(id);
        },
        watchGame: async (id: string) => {
          calls.watchGame(id);
          open(id);
        },
        leaveToLobby: async () => {
          calls.leaveToLobby();
          if (opts.leaveAllowed === false) return false;
          setViewMode('lobby');
          return true;
        },
        openSandbox: () => {
          calls.openSandbox();
          setViewMode('sandbox');
        },
        triggerToast: calls.triggerToast,
      });
      return { route, viewMode, activeGameId, open, setViewMode };
    },
    { initialProps: { authReady: opts.authReady ?? true } },
  );
  return { ...view, calls };
}

const here = () =>
  window.location.pathname + window.location.search + window.location.hash;

/** Back or Forward to `path`: the address changes first, then `popstate` fires. */
async function popTo(path: string) {
  await act(async () => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

let push: ReturnType<typeof vi.spyOn>;
let replace: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  plainFetch.mockReset();
  window.history.replaceState(null, '', '/');
  push = vi.spyOn(window.history, 'pushState');
  replace = vi.spyOn(window.history, 'replaceState');
});
afterEach(() => {
  push.mockRestore();
  replace.mockRestore();
});

function loadAt(path: string) {
  window.history.replaceState(null, '', path);
  replace.mockClear();
}

describe('useGameRoute on load', () => {
  it('watches a public match from its link, keeping the address', async () => {
    loadAt('/game/mp_1');
    plainFetch.mockReturnValueOnce(reply(200, summary()));
    const { result, calls } = renderRoute();
    await waitFor(() => expect(result.current.viewMode).toBe('multiplayer'));
    expect(plainFetch).toHaveBeenCalledWith('/api/games/mp_1');
    expect(calls.watchGame).toHaveBeenCalledWith('mp_1');
    expect(here()).toBe('/game/mp_1');
    expect(push).not.toHaveBeenCalled();
  });

  it('takes a seated player into their seat', async () => {
    loadAt('/game/mp_1');
    plainFetch.mockReturnValueOnce(
      reply(
        200,
        summary({
          participants: {
            FRANCE: { power: 'FRANCE', user_id: 'me' },
          } as unknown as MultiplayerGameSummary['participants'],
          has_passcode: true,
        }),
      ),
    );
    const { result, calls } = renderRoute({ authUser: ME });
    await waitFor(() => expect(result.current.viewMode).toBe('multiplayer'));
    expect(calls.enterSeat).toHaveBeenCalledWith('mp_1', 'FRANCE');
    expect(calls.watchGame).not.toHaveBeenCalled();
  });

  it('waits for the first read of who is signed in', async () => {
    loadAt('/game/mp_1');
    plainFetch.mockReturnValueOnce(reply(200, summary()));
    const { rerender } = renderRoute({ authReady: false });
    await act(async () => {});
    expect(plainFetch).not.toHaveBeenCalled();
    expect(here()).toBe('/game/mp_1');
    rerender({ authReady: true });
    await waitFor(() => expect(plainFetch).toHaveBeenCalledTimes(1));
  });

  it('asks for a private match passcode and puts the lobby at /', async () => {
    loadAt('/game/mp_1');
    plainFetch.mockReturnValueOnce(reply(200, summary({ has_passcode: true })));
    const { result, calls } = renderRoute();
    await waitFor(() =>
      expect(result.current.route.passcodeRequest).toEqual({ gameId: 'mp_1' }),
    );
    expect(calls.watchGame).not.toHaveBeenCalled();
    expect(result.current.viewMode).toBe('lobby');
    await waitFor(() => expect(here()).toBe('/'));
    expect(push).not.toHaveBeenCalled();
    act(() => result.current.route.clearPasscodeRequest());
    expect(result.current.route.passcodeRequest).toBeNull();
  });

  it('watches a private match whose passcode was typed this visit', async () => {
    loadAt('/game/mp_1');
    plainFetch.mockReturnValueOnce(reply(200, summary({ has_passcode: true })));
    const { calls } = renderRoute({ matchPasscodes: { mp_1: 'pw' } });
    await waitFor(() => expect(calls.watchGame).toHaveBeenCalledWith('mp_1'));
  });

  it('shows the lobby and says so for a game that does not exist', async () => {
    loadAt('/game/mp_gone');
    plainFetch.mockReturnValueOnce(reply(404));
    const { result, calls } = renderRoute();
    await waitFor(() =>
      expect(calls.triggerToast).toHaveBeenCalledWith(
        'No campaign has that Game ID.',
      ),
    );
    await waitFor(() => expect(here()).toBe('/'));
    expect(result.current.viewMode).toBe('lobby');
    expect(push).not.toHaveBeenCalled();
  });

  it.each(['/game/solo_1', '/game/saved_1', '/game/sbx_1'])(
    'ignores an owner-only link (%s)',
    async (path) => {
      loadAt(path);
      const { result } = renderRoute();
      await waitFor(() => expect(here()).toBe('/'));
      expect(plainFetch).not.toHaveBeenCalled();
      expect(result.current.viewMode).toBe('lobby');
    },
  );

  it('leaves a ?view=sandbox address alone in the sandbox', async () => {
    loadAt('/?view=sandbox');
    renderRoute({ viewMode: 'sandbox' });
    await act(async () => {});
    expect(here()).toBe('/?view=sandbox');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('useGameRoute after load', () => {
  it('pushes a page for each screen, never a passcode', async () => {
    const { result } = renderRoute({ matchPasscodes: { mp_1: 'secret' } });
    await act(async () => {});
    act(() => result.current.open('mp_1'));
    expect(push).toHaveBeenLastCalledWith(null, '', '/game/mp_1');
    act(() => result.current.setViewMode('lobby'));
    expect(push).toHaveBeenLastCalledWith(null, '', '/');
    for (const call of push.mock.calls) {
      expect(String(call[2])).not.toContain('secret');
    }
  });

  it('Back to / leaves for the lobby, and Forward reopens the game', async () => {
    const { result, calls } = renderRoute();
    await act(async () => {});
    act(() => result.current.open('mp_1'));
    push.mockClear();

    await popTo('/');
    expect(calls.leaveToLobby).toHaveBeenCalledTimes(1);
    expect(result.current.viewMode).toBe('lobby');
    expect(push).not.toHaveBeenCalled();

    plainFetch.mockReturnValueOnce(reply(200, summary()));
    await popTo('/game/mp_1');
    await waitFor(() => expect(result.current.viewMode).toBe('multiplayer'));
    expect(calls.watchGame).toHaveBeenCalledWith('mp_1');
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe('/game/mp_1');
  });

  it('puts the game address back when the player stays on the board', async () => {
    const { result } = renderRoute({ leaveAllowed: false });
    await act(async () => {});
    act(() => result.current.open('mp_1'));
    push.mockClear();
    await popTo('/');
    expect(result.current.viewMode).toBe('multiplayer');
    expect(push).toHaveBeenCalledWith(null, '', '/game/mp_1');
  });

  it('leaves one board through the lobby to open another', async () => {
    const { result, calls } = renderRoute();
    await act(async () => {});
    act(() => result.current.open('mp_1'));
    plainFetch.mockReturnValueOnce(reply(200, summary({ game_id: 'mp_2' })));
    await popTo('/game/mp_2');
    await waitFor(() => expect(result.current.activeGameId).toBe('mp_2'));
    expect(calls.leaveToLobby).toHaveBeenCalledTimes(1);
    expect(calls.watchGame).toHaveBeenCalledWith('mp_2');
  });

  it('Back to ?view=sandbox opens the Solo Sandbox', async () => {
    const { result, calls } = renderRoute();
    await act(async () => {});
    await popTo('/?view=sandbox');
    expect(calls.openSandbox).toHaveBeenCalledTimes(1);
    expect(result.current.viewMode).toBe('sandbox');
    expect(here()).toBe('/?view=sandbox');
  });
});
