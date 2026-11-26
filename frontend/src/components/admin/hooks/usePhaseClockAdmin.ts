import { useCallback, useState } from 'react';
import { apiFetch, readErrorDetail } from '../../../lib/api';
import type { GameState, TimerSettings } from '../../../types/diplomacy';

export type ClockAction = 'start' | 'pause' | 'resume' | 'stop';

export type DeadlineChange =
  | { seconds_left: number }
  | { adjust_seconds: number }
  | { deadline: number };

/**
 * The host's overrides of the phase clock (issue #393). Each call answers with the new board,
 * handed to `onStateUpdated`; a refusal's message goes to `onError`.
 */
export function usePhaseClockAdmin({
  gameId,
  onStateUpdated,
  onToast,
  onError,
}: {
  gameId: string;
  onStateUpdated: (state: GameState) => void;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (
      path: string,
      done: string,
      init: { method?: string; json?: unknown } = {},
    ): Promise<boolean> => {
      setBusy(true);
      onError(null);
      try {
        const res = await apiFetch(
          `/games/${encodeURIComponent(gameId)}/timer/${path}`,
          { method: init.method ?? 'POST', json: init.json },
        );
        if (!res.ok) {
          onError(
            await readErrorDetail(res, 'The clock could not be changed.'),
          );
          return false;
        }
        onStateUpdated(await res.json());
        onToast(done);
        return true;
      } catch (e: unknown) {
        onError(
          e instanceof Error ? e.message : 'Network error changing the clock.',
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [gameId, onStateUpdated, onToast, onError],
  );

  const DONE: Record<ClockAction, string> = {
    start: 'Turn clock started.',
    pause: 'Turn clock paused.',
    resume: 'Turn clock resumed.',
    stop: 'Turn clock turned off.',
  };

  return {
    busy,
    run: (action: ClockAction) => send(action, DONE[action]),
    setDeadline: (change: DeadlineChange) =>
      send('deadline', 'Turn clock updated.', { json: change }),
    saveSettings: (settings: TimerSettings) =>
      send('settings', 'Clock lengths saved.', {
        method: 'PUT',
        json: settings,
      }),
  };
}
