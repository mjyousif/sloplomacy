// @vitest-environment jsdom
import {
  act,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestionStore } from '../../lib/suggestionStore';
import type { Unit } from '../../types/diplomacy';
import { OpeningsButton, OpeningsList } from './OpeningsList';
import { useOpeningsPanel } from './useOpeningsPanel';

const ITALY: Unit[] = [
  { id: 'ITA_F_NAP', power: 'ITALY', unit_type: 'F', province: 'NAP' },
  { id: 'ITA_A_ROM', power: 'ITALY', unit_type: 'A', province: 'ROM' },
  { id: 'ITA_A_VEN', power: 'ITALY', unit_type: 'A', province: 'VEN' },
];
const TURN = 'Spring 1901 Movement';

afterEach(() => suggestionStore.reset());

const Harness = ({ units = ITALY }: { units?: Unit[] }) => {
  const panel = useOpeningsPanel({
    available: true,
    power: 'ITALY',
    units,
    turn: TURN,
  });
  return (
    <>
      <OpeningsButton panel={panel} />
      {panel.open && <OpeningsList panel={panel} power="ITALY" />}
    </>
  );
};

describe('OpeningsList', () => {
  it('opens from the button and lists the power’s openings, most played first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByTestId('openings-list')).toBeNull();
    await user.click(screen.getByTestId('btn-openings'));
    expect(screen.getByTestId('btn-openings')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rows = screen.getAllByTestId('opening-row');
    expect(rows[0]).toHaveAttribute('data-opening', 'ita-tyrolian-attack');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('previews a picked opening on the map, with its strengths and weaknesses', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('btn-openings'));
    await user.click(screen.getByRole('button', { name: /Lepanto Opening/ }));

    const preview = suggestionStore.getState().opening;
    expect(preview).toMatchObject({
      id: 'ita-lepanto',
      power: 'ITALY',
      turn: TURN,
    });
    expect(preview?.orders.map((o) => o.order_type)).toEqual([
      'MOVE',
      'MOVE',
      'HOLD',
    ]);
    const lepanto = screen
      .getAllByTestId('opening-row')
      .find((r) => r.getAttribute('data-opening') === 'ita-lepanto');
    expect(lepanto).toBeDefined();
    const row = within(lepanto as HTMLElement);
    expect(row.getByTestId('opening-approach')).toHaveTextContent('Standard');
    expect(row.getByRole('img', { name: 'With Austria' })).toBeInTheDocument();
    expect(
      row.getByRole('img', { name: 'Against Turkey' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Strengths' })).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Weaknesses' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /The Lepanto Opening/ }),
    ).toHaveAttribute('href', 'https://diplomacyzines.co.uk/?page_id=1734');

    // Picking it again takes it off the map.
    await user.click(screen.getByRole('button', { name: /Lepanto Opening/ }));
    expect(suggestionStore.getState().opening).toBeNull();
  });

  it('uses the opening’s orders, then closes the list and the preview', async () => {
    const user = userEvent.setup();
    const apply = vi.fn(async () => null);
    suggestionStore.setOpeningApplier(apply);
    render(<Harness />);
    await user.click(screen.getByTestId('btn-openings'));
    await user.click(screen.getByRole('button', { name: /Alpine Chicken/ }));
    await user.click(screen.getByTestId('opening-use'));

    expect(apply).toHaveBeenCalledTimes(1);
    const [power, orders] = apply.mock.calls[0] as unknown as [
      string,
      { unit_id: string; target: string | null }[],
    ];
    expect(power).toBe('ITALY');
    expect(orders.map((o) => [o.unit_id, o.target])).toEqual([
      ['ITA_F_NAP', 'ION'],
      ['ITA_A_VEN', 'PIE'],
      ['ITA_A_ROM', 'VEN'],
    ]);
    expect(screen.queryByTestId('openings-list')).toBeNull();
    expect(suggestionStore.getState().opening).toBeNull();
  });

  it('keeps the list open and says why when the orders are refused', async () => {
    const user = userEvent.setup();
    suggestionStore.setOpeningApplier(async () => 'Not your turn.');
    render(<Harness />);
    await user.click(screen.getByTestId('btn-openings'));
    await user.click(screen.getByRole('button', { name: /Alpine Chicken/ }));
    await user.click(screen.getByTestId('opening-use'));
    expect(screen.getByRole('alert')).toHaveTextContent('Not your turn.');
    expect(screen.getByTestId('openings-list')).toBeInTheDocument();
  });

  it('greys out an opening whose units have moved', async () => {
    const user = userEvent.setup();
    const moved = ITALY.map((u) =>
      u.id === 'ITA_A_VEN' ? { ...u, province: 'TYR' } : u,
    );
    render(<Harness units={moved} />);
    await user.click(screen.getByTestId('btn-openings'));
    const row = screen
      .getAllByTestId('opening-row')
      .find((r) => r.getAttribute('data-opening') === 'ita-lepanto');
    expect(row).toHaveAttribute('data-unavailable', 'true');
    expect(
      screen.getByRole('button', { name: /Lepanto Opening/ }),
    ).toBeDisabled();
  });
});

describe('useOpeningsPanel', () => {
  it('closes and clears the preview when the first turn ends', () => {
    const { result, rerender } = renderHook(
      ({ available }) =>
        useOpeningsPanel({
          available,
          power: 'ITALY',
          units: ITALY,
          turn: TURN,
        }),
      { initialProps: { available: true } },
    );
    act(() => result.current.toggle());
    act(() => result.current.select(result.current.entries[0]));
    expect(result.current.open).toBe(true);
    expect(suggestionStore.getState().opening).not.toBeNull();

    rerender({ available: false });
    expect(result.current.open).toBe(false);
    expect(suggestionStore.getState().opening).toBeNull();
  });
});
