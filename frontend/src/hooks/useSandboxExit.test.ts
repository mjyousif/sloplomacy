// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SandboxExitOptions, useSandboxExit } from './useSandboxExit';

const supabase = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);

function makeOptions(
  over: Partial<SandboxExitOptions> = {},
): SandboxExitOptions {
  return {
    viewMode: 'multiplayer',
    sandboxGameId: 'sbx_9',
    playerPower: 'FRANCE',
    setSandboxGameId: vi.fn(),
    setSandboxMode: vi.fn(),
    setShowSimulationOverlay: vi.fn(),
    ...over,
  };
}

function renderExit(o: SandboxExitOptions) {
  return renderHook((props: SandboxExitOptions) => useSandboxExit(props), {
    initialProps: o,
  });
}

beforeEach(() => {
  supabase.authedFetch.mockReset();
  supabase.authedFetch.mockResolvedValue({ ok: true });
});

describe('useSandboxExit', () => {
  it('leaves the private copy open while the player is on the match board', () => {
    const o = makeOptions();
    renderExit(o);
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.setSandboxGameId).not.toHaveBeenCalled();
  });

  it.each(['lobby', 'sandbox'] as const)(
    'closes it when the player goes to the %s',
    (viewMode) => {
      const o = makeOptions();
      const { rerender } = renderExit(o);
      rerender({ ...o, viewMode });
      expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
      const [url, init] = supabase.authedFetch.mock.calls[0];
      expect(url).toBe('/api/sandbox/exit?game_id=sbx_9');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({ power: 'FRANCE' });
      expect(o.setSandboxGameId).toHaveBeenCalledWith(null);
      expect(o.setSandboxMode).toHaveBeenCalledWith(false);
      expect(o.setShowSimulationOverlay).toHaveBeenCalledWith(false);
    },
  );

  it('has nothing to close without a private copy', () => {
    const o = makeOptions({ sandboxGameId: null, viewMode: 'lobby' });
    renderExit(o);
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.setSandboxMode).not.toHaveBeenCalled();
  });

  it('closes a copy opened away from the match board at once', () => {
    const o = makeOptions({ sandboxGameId: null, viewMode: 'lobby' });
    const { rerender } = renderExit(o);
    rerender({ ...o, sandboxGameId: 'sbx_3' });
    expect(supabase.authedFetch.mock.calls[0][0]).toBe(
      '/api/sandbox/exit?game_id=sbx_3',
    );
  });

  it('runs once per change, not on every render', () => {
    const o = makeOptions({ viewMode: 'lobby' });
    const { rerender } = renderExit(o);
    rerender({ ...o, playerPower: 'GERMANY' });
    rerender({ ...o });
    expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
  });

  it('a failed close is ignored', () => {
    // Vitest's mocks watch the promises they return, so an unhandled rejection would not
    // show here. The reply stands in for one, to check that a failure is caught.
    const pending = { catch: vi.fn() };
    supabase.authedFetch.mockReturnValue(pending);
    const o = makeOptions({ viewMode: 'lobby' });
    renderExit(o);
    expect(pending.catch).toHaveBeenCalledTimes(1);
    const onFailure = pending.catch.mock.calls[0][0];
    expect(() => onFailure(new Error('offline'))).not.toThrow();
    expect(o.setSandboxGameId).toHaveBeenCalledWith(null);
  });
});
