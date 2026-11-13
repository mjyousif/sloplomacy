// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { progressFor } from '../../test/macroFixtures';
import type { AuthUser, GameState } from '../../types/diplomacy';
import {
  type AdminTurnClockSettings,
  AdminTurnClockSidebar,
} from './AdminTurnClockSidebar';

vi.mock('../../lib/supabase', () => ({
  getAuthHeaders: async () => ({ Authorization: 'Bearer tok' }),
}));

const STATE = {
  game_id: 'mp_1',
  season: 'Fall',
  year: 1902,
  phase: 'Retreats',
  units: [],
  orders: {},
  ownership: {},
  active_power: 'FRANCE',
  finalized_powers: [],
  surrendered_powers: [],
  issues: [],
  turn_history: [],
  last_resolution: null,
  winner: null,
} as unknown as GameState;

const UPDATED_STATE = {
  ...STATE,
  season: 'Spring',
  year: 1903,
  phase: 'Movement',
} as GameState;

const USER = { id: 'u1', email: 'a@b.c', displayName: 'Ada' } as AuthUser;

const calls: { url: string; method?: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      const body = url.includes('/status')
        ? {
            history_count: 2,
            can_rollback: true,
            history_entries: [
              { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
              { index: 1, season: 'Fall', year: 1901, phase: 'Movement' },
            ],
          }
        : UPDATED_STATE;
      return { ok: true, json: async () => body } as Response;
    }),
  );
});

function setup(
  overSettings: Partial<AdminTurnClockSettings> = {},
  overProps: Partial<React.ComponentProps<typeof AdminTurnClockSidebar>> = {},
) {
  const settings: AdminTurnClockSettings = {
    isOpen: true,
    onClose: vi.fn(),
    gameId: 'mp_1',
    gameState: STATE,
    user: USER,
    onStateUpdated: vi.fn(),
    onToast: vi.fn(),
    ...overSettings,
  };
  const props = {
    variant: 'panel' as const,
    sheetSnap: 'peek' as const,
    collapsed: false,
    onToggleCollapse: vi.fn(),
    activePower: 'FRANCE' as const,
    progress: progressFor(),
    settings,
    ...overProps,
  };
  const user = userEvent.setup();
  const view = render(<AdminTurnClockSidebar {...props} />);
  return { settings, props, user, view };
}

describe('AdminTurnClockSidebar', () => {
  it('does not fetch admin status while closed', async () => {
    setup({ isOpen: false });
    await act(async () => {});
    expect(calls).toEqual([]);
  });

  it('fetches status on open and reverts to the chosen snapshot after confirmation', async () => {
    const { settings, user } = setup();
    await waitFor(() =>
      expect(
        screen.getByTestId('select-admin-rollback-snapshot'),
      ).toHaveTextContent('Fall 1901 Movement'),
    );
    expect(calls[0].url).toBe('/api/admin/status?game_id=mp_1');

    // Switch snapshot to Spring 1901 Movement
    await user.click(screen.getByTestId('select-admin-rollback-snapshot'));
    await user.click(
      screen.getByTestId('select-admin-rollback-snapshot-option-0'),
    );

    // Cancelling confirmation does not post
    await user.click(screen.getByTestId('btn-admin-rollback'));
    await user.click(screen.getByText('Cancel'));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    // Confirming posts rollback with the selected snapshot index
    await user.click(screen.getByTestId('btn-admin-rollback'));
    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));

    await waitFor(() =>
      expect(settings.onStateUpdated).toHaveBeenCalledWith(UPDATED_STATE),
    );
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe('/api/admin/rollback?game_id=mp_1');
    expect(post?.body).toMatchObject({ snapshot_index: 0, user_id: 'u1' });
    expect(settings.onToast).toHaveBeenCalledWith(
      'Turn rolled back to Spring 1903 Movement!',
    );
  });

  it('applies clock/season changes via Apply button', async () => {
    const { settings, user } = setup();
    await waitFor(() => expect(calls).toHaveLength(1));

    await user.click(screen.getByTestId('select-admin-season'));
    await user.click(screen.getByTestId('select-admin-season-option-spring'));
    await user.click(screen.getByTestId('btn-admin-year-up'));
    await user.click(screen.getByTestId('select-admin-phase'));
    await user.click(screen.getByTestId('select-admin-phase-option-movement'));

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(settings.onStateUpdated).toHaveBeenCalledWith(UPDATED_STATE),
    );
    const post = calls.find((c) => c.url.includes('/admin/set-turn'));
    expect(post?.body).toMatchObject({
      season: 'Spring',
      year: 1903,
      phase: 'Movement',
    });
    expect(settings.onToast).toHaveBeenCalledWith(
      'Clock adjusted to Spring 1903 (Movement Phase).',
    );
  });

  it('unlocks all power orders and shows an error banner on server failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/status')) {
          return {
            ok: true,
            json: async () => ({
              history_count: 0,
              can_rollback: false,
              history_entries: [],
            }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ detail: 'Permission denied' }),
        } as Response;
      }),
    );

    const { settings, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Unlock All Orders' }));
    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(settings.onStateUpdated).not.toHaveBeenCalled();
  });

  it('renders the Turn & Clock Settings collapsed rail when collapsed', async () => {
    const { props, user } = setup({}, { collapsed: true });
    const expandBtn = screen.getByTestId('macro-sidebar-expand-btn');
    expect(expandBtn).toHaveAttribute(
      'title',
      'Expand Turn and Clock Settings',
    );
    await user.click(expandBtn);
    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});
