// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  ProvinceInfo,
  Unit,
} from '../types/diplomacy';
import { AdminToolsModal } from './AdminToolsModal';

vi.mock('../lib/supabase', () => ({
  getAuthHeaders: async () => ({ Authorization: 'Bearer tok' }),
}));

const prov = (id: string, name: string, over: Partial<ProvinceInfo> = {}) =>
  ({
    id,
    name,
    type: 'LAND',
    is_supply_center: true,
    home_power: null,
    coasts: [],
    army_adj: [],
    fleet_adj: {},
    ...over,
  }) as ProvinceInfo;
const PROVINCES: Record<string, ProvinceInfo> = {
  PAR: prov('PAR', 'Paris'),
  BUR: prov('BUR', 'Burgundy'),
  BEL: prov('BEL', 'Belgium'),
  STP: prov('STP', 'St Petersburg', { coasts: ['NC', 'SC'] }),
  LON: prov('LON', 'London'),
};
const UNITS = [
  {
    id: 'A_PAR',
    power: 'FRANCE',
    province: 'PAR',
    unit_type: 'A',
    coast: null,
  },
  {
    id: 'F_LON',
    power: 'ENGLAND',
    province: 'LON',
    unit_type: 'F',
    coast: null,
  },
] as unknown as Unit[];
const STATE = {
  season: 'Fall',
  year: 1902,
  phase: 'Retreats',
  units: UNITS,
  ownership: { BEL: 'FRANCE' },
} as unknown as GameState;
const USER = { id: 'u1', email: 'a@b.c', displayName: 'Ada' } as AuthUser;
const NEW = { ...STATE, season: 'Spring', year: 1903, phase: 'Movement' };

const calls: { url: string; method?: string; body?: any }[] = [];
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
        ? { history_count: 2, can_rollback: true }
        : NEW;
      return { ok: true, json: async () => body } as Response;
    }),
  );
});

function setup(
  over: Partial<React.ComponentProps<typeof AdminToolsModal>> = {},
) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    gameId: 'mp_1',
    gameState: STATE,
    provinces: PROVINCES,
    user: USER,
    onStateUpdated: vi.fn(),
    onToast: vi.fn(),
    adminOverrideActive: false,
    onToggleAdminOverride: vi.fn(),
    onResetScenario: vi.fn(),
    ...over,
  };
  const user = userEvent.setup();
  const view = render(<AdminToolsModal {...props} />);
  return { props, user, view };
}
const posts = () => calls.filter((c) => c.method === 'POST');
const tab = (name: RegExp) => screen.getByRole('button', { name });
/** The labels aren't tied to their controls, so find the select next to the label's text. */
const field = (label: string | RegExp) =>
  screen
    .getByText(label)
    .parentElement?.querySelector('select') as HTMLSelectElement;

describe('AdminToolsModal', () => {
  it('renders nothing while closed, and asks the server nothing', async () => {
    const { view } = setup({ isOpen: false });
    await act(async () => {});
    expect(view.container).toBeEmptyDOMElement();
    expect(calls).toEqual([]);
  });

  it('shows the clock, the timeline from the server and the override switch', async () => {
    const { props, user } = setup();
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Imperial State & Turn Arbitrator',
    );
    expect(screen.getByText('Fall 1902 — Retreats')).toBeInTheDocument();
    await screen.findByText('2 snapshots in timeline');
    await user.click(screen.getByText(/Map Direct-Edit Mode: DISABLED/));
    expect(props.onToggleAdminOverride).toHaveBeenCalledTimes(1);
  });

  it('says ENABLED, and a single snapshot in the singular', async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({ history_count: 1, can_rollback: false }),
        }) as Response,
    );
    setup({ adminOverrideActive: true });
    await screen.findByText('1 snapshot in timeline');
    expect(
      screen.getByText(/Map Direct-Edit Mode: ENABLED/),
    ).toBeInTheDocument();
  });

  it('closes from the X, Done and the backdrop, but not from a click inside', async () => {
    const { props, user, view } = setup();
    await user.click(screen.getByRole('dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Close Admin Modal'));
    await user.click(screen.getByTestId('btn-admin-close'));
    await user.click(
      view.container.querySelector('.admin-modal-backdrop') as Element,
    );
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('opens on the turn tab and switches between the four', async () => {
    const { user } = setup();
    expect(screen.getByText('Roll Back Adjudicated Turn')).toBeInTheDocument();
    await user.click(tab(/Move Units Anywhere/));
    expect(
      screen.getByText('Relocate / Teleport Any Unit'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Roll Back Adjudicated Turn'),
    ).not.toBeInTheDocument();
    await user.click(tab(/Spawn \/ Destroy Units/));
    expect(screen.getByText('Spawn New Unit')).toBeInTheDocument();
    await user.click(tab(/Territory & Powers/));
    expect(
      screen.getByText('Supply Center & Province Ownership'),
    ).toBeInTheDocument();
    await user.click(tab(/Turn Rollback & Clock/));
    expect(screen.getByText('Adjust Game Clock & Season')).toBeInTheDocument();
  });

  it('rolls back through its confirmation', async () => {
    const { props, user } = setup();
    await waitFor(() =>
      expect(screen.getByTestId('btn-admin-rollback')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('btn-admin-rollback'));
    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));
    await waitFor(() => expect(props.onStateUpdated).toHaveBeenCalledWith(NEW));
    expect(posts()[0].url).toBe('/api/admin/rollback?game_id=mp_1');
    expect(props.onToast).toHaveBeenCalledWith(
      'Turn rolled back to Spring 1903 Movement!',
    );
  });

  it('applies the clock and unlocks every power', async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole('button', { name: /Apply Clock Changes/ }),
    );
    await waitFor(() => expect(props.onStateUpdated).toHaveBeenCalledTimes(1));
    expect(posts()[0]).toMatchObject({
      url: '/api/admin/set-turn?game_id=mp_1',
      body: { season: 'Fall', year: 1902, phase: 'Retreats' },
    });
    await user.click(
      screen.getByRole('button', { name: /Unlock \/ Unfinalize All/ }),
    );
    await waitFor(() => expect(props.onStateUpdated).toHaveBeenCalledTimes(2));
    expect(posts()[1].url).toBe('/api/admin/unfinalize-all?game_id=mp_1');
  });

  it('relocates the picked unit to the picked province, listed by name', async () => {
    const { props, user } = setup();
    await user.click(tab(/Move Units Anywhere/));
    const [unitSel, destSel] = screen.getAllByRole('combobox');
    expect(
      within(destSel)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'BEL — Belgium (LAND)',
      'BUR — Burgundy (LAND)',
      'LON — London (LAND)',
      'PAR — Paris (LAND)',
      'STP — St Petersburg (LAND)',
    ]);
    await user.selectOptions(unitSel, 'F_LON');
    await user.selectOptions(destSel, 'STP');
    await user.selectOptions(field(/Fleet Coast in St Petersburg/), 'SC');
    await user.click(screen.getByRole('button', { name: /Relocate Unit Now/ }));
    await waitFor(() => expect(props.onToast).toHaveBeenCalled());
    expect(posts()[0]).toMatchObject({
      url: '/api/admin/unit/move?game_id=mp_1',
      body: { unit_id: 'F_LON', new_province: 'STP', new_coast: 'SC' },
    });
    expect(props.onToast).toHaveBeenCalledWith('Relocated unit F_LON to STP!');
  });

  it('spawns what the form says', async () => {
    const { props, user } = setup();
    await user.click(tab(/Spawn \/ Destroy Units/));
    await user.selectOptions(field('Great Power'), 'GERMANY');
    await user.selectOptions(field('Unit Type'), 'F');
    await user.selectOptions(field('Province'), 'STP');
    await user.click(screen.getByRole('button', { name: /Spawn Unit/ }));
    await waitFor(() => expect(props.onToast).toHaveBeenCalled());
    expect(posts()[0].body).toMatchObject({
      power: 'GERMANY',
      unit_type: 'F',
      province: 'STP',
      coast: null,
    });
    expect(props.onToast).toHaveBeenCalledWith('Spawned Germany Fleet in STP!');
  });

  it('filters the destroy list by country and destroys after a yes', async () => {
    const { props, user } = setup();
    await user.click(tab(/Spawn \/ Destroy Units/));
    expect(screen.getAllByTitle(/^Destroy .* unit in/)).toHaveLength(2);
    await user.selectOptions(field('Filter by Country:'), 'ENGLAND');
    const destroy = screen.getAllByTitle(/^Destroy .* unit in/);
    expect(destroy).toHaveLength(1);
    await user.click(destroy[0]);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'England Fleet in LON will be removed from the board.',
    );
    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));
    await waitFor(() =>
      expect(props.onToast).toHaveBeenCalledWith('Destroyed unit in LON.'),
    );
    expect(posts()[0].body).toMatchObject({ unit_id: 'F_LON' });
  });

  it('assigns ownership to the picked power', async () => {
    const { props, user } = setup();
    await user.click(tab(/Territory & Powers/));
    await user.selectOptions(field('Province'), 'PAR');
    await user.selectOptions(field('New Owner'), 'GERMANY');
    await user.click(
      screen.getByRole('button', { name: /Set Province Ownership/ }),
    );
    await waitFor(() => expect(props.onToast).toHaveBeenCalled());
    expect(posts()[0]).toMatchObject({
      url: '/api/admin/ownership?game_id=mp_1',
      body: { province: 'PAR', power: 'GERMANY' },
    });
    expect(props.onToast).toHaveBeenCalledWith('Assigned PAR to Germany!');
  });

  it('hard-resets only after a yes, and then closes', async () => {
    const { props, user } = setup();
    await user.click(tab(/Territory & Powers/));
    await user.click(
      screen.getByRole('button', { name: /Hard Reset to Standard/ }),
    );
    await user.click(screen.getByText('Cancel'));
    expect(props.onResetScenario).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: /Hard Reset to Standard/ }),
    );
    await user.click(screen.getByTestId('btn-confirm-modal-confirm'));
    expect(props.onResetScenario).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no hard reset without a handler', async () => {
    const { user } = setup({ onResetScenario: undefined });
    await user.click(tab(/Territory & Powers/));
    expect(screen.queryByText(/Hard Reset/)).not.toBeInTheDocument();
  });

  it('shows the game clock and the timeline count in the turn tab', async () => {
    setup();
    await screen.findByText('Previous snapshot is ready to restore (2 saved).');
    expect(field('Season')).toHaveValue('Fall');
    expect(field('Phase')).toHaveValue('Retreats');
    expect(
      (screen.getByText('Year').parentElement as HTMLElement).querySelector(
        'input',
      ),
    ).toHaveValue(1902);
  });

  it('keeps what was picked in each tab when switching away and back', async () => {
    const { user } = setup();
    await user.click(tab(/Move Units Anywhere/));
    await user.selectOptions(field('Select Unit on Board'), 'F_LON');
    await user.selectOptions(field('Destination Province'), 'STP');
    await user.selectOptions(field(/Fleet Coast in St Petersburg/), 'SC');
    await user.click(tab(/Spawn \/ Destroy Units/));
    await user.selectOptions(field('Great Power'), 'GERMANY');
    await user.selectOptions(field('Unit Type'), 'F');
    await user.selectOptions(field('Province'), 'STP');
    await user.selectOptions(field(/Coast in St Petersburg/), 'SC');
    await user.selectOptions(field('Filter by Country:'), 'FRANCE');
    await user.click(tab(/Territory & Powers/));
    await user.selectOptions(field('Province'), 'PAR');
    await user.selectOptions(field('New Owner'), 'ITALY');
    await user.click(tab(/Move Units Anywhere/));
    expect(field('Select Unit on Board')).toHaveValue('F_LON');
    expect(field('Destination Province')).toHaveValue('STP');
    expect(field(/Fleet Coast in St Petersburg/)).toHaveValue('SC');
    await user.click(tab(/Spawn \/ Destroy Units/));
    expect(field('Great Power')).toHaveValue('GERMANY');
    expect(field('Unit Type')).toHaveValue('F');
    expect(field('Province')).toHaveValue('STP');
    expect(field(/Coast in St Petersburg/)).toHaveValue('SC');
    expect(field('Filter by Country:')).toHaveValue('FRANCE');
    await user.click(tab(/Territory & Powers/));
    expect(field('Province')).toHaveValue('PAR');
    expect(field('New Owner')).toHaveValue('ITALY');
  });

  it('sends the coast picked in the spawn tab', async () => {
    const { props, user } = setup();
    await user.click(tab(/Spawn \/ Destroy Units/));
    await user.selectOptions(field('Unit Type'), 'F');
    await user.selectOptions(field('Province'), 'STP');
    await user.selectOptions(field(/Coast in St Petersburg/), 'SC');
    await user.click(screen.getByRole('button', { name: /Spawn Unit/ }));
    await waitFor(() => expect(props.onToast).toHaveBeenCalled());
    expect(posts()[0].body.coast).toBe('SC');
  });

  it('shows no error banner until something fails, and marks the override switch when on', () => {
    const off = setup();
    expect(off.view.container.querySelector('.admin-error-banner')).toBeNull();
    expect(
      screen.getByText(/Map Direct-Edit Mode/).closest('button'),
    ).not.toHaveClass('active');
    off.view.unmount();
    setup({ adminOverrideActive: true });
    expect(
      screen.getByText(/Map Direct-Edit Mode/).closest('button'),
    ).toHaveClass('active');
  });

  it('disables the actions while a request is out', async () => {
    let release: () => void = () => {};
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/status'))
        return {
          ok: true,
          json: async () => ({ history_count: 0, can_rollback: false }),
        } as Response;
      await new Promise<void>((r) => {
        release = r;
      });
      return { ok: true, json: async () => NEW } as Response;
    });
    const { props, user } = setup();
    const unlock = screen.getByRole('button', {
      name: /Unlock \/ Unfinalize All/,
    });
    await user.click(unlock);
    await waitFor(() => expect(unlock).toBeDisabled());
    expect(
      screen.getByRole('button', { name: /Apply Clock Changes/ }),
    ).toBeDisabled();
    release();
    await waitFor(() => expect(props.onToast).toHaveBeenCalled());
    await waitFor(() => expect(unlock).toBeEnabled());
  });
});
