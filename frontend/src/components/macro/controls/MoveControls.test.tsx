// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  F_ENG,
  MACRO_PROVINCES,
  OPTIONS_A_BRE,
} from '../../../test/macroFixtures';
import type { UnitMoveOptions } from '../../../types/diplomacy';
import { holdOrder, moveOrder } from '../../../utils/orderBuilders';
import { MoveControls } from './MoveControls';

const REACHABLE = [
  { province: 'PAR', coasts: [] },
  { province: 'GAS', coasts: [] },
];

const controls = (
  over: Partial<Parameters<typeof MoveControls>[0]> = {},
  onUpdateOrder = vi.fn(),
) => {
  render(
    <MoveControls
      unit={A_BRE}
      order={moveOrder(A_BRE, 'PAR', null, false)}
      provinces={MACRO_PROVINCES}
      reachable={REACHABLE}
      unitOptions={OPTIONS_A_BRE}
      onUpdateOrder={onUpdateOrder}
      {...over}
    />,
  );
  return {
    select: screen.getByTestId('select-order-target') as HTMLSelectElement,
    onUpdateOrder,
  };
};

const labels = (select: HTMLSelectElement) =>
  Array.from(select.querySelectorAll('optgroup')).map((g) => ({
    label: g.label,
    options: Array.from(g.querySelectorAll('option')).map((o) => o.textContent),
  }));

describe('MoveControls', () => {
  it('groups the reachable provinces and the coastal via-convoy ones', () => {
    const { select } = controls();
    expect(select.value).toBe('PAR');
    expect(labels(select)).toEqual([
      {
        label: 'Reachable Provinces',
        options: ['Paris (PAR)', 'Gascony (GAS)'],
      },
      {
        label: 'Coastal (via Convoy)',
        options: ['Marseilles (MAR) — via Convoy'],
      },
    ]);
  });

  it('marks a convoy that is ready', () => {
    const { select } = controls({
      unitOptions: { ...OPTIONS_A_BRE, active_convoys: ['MAR'] },
    });
    expect(labels(select)[1].options).toEqual([
      'Marseilles (MAR) — via Convoy [Ready]',
    ]);
  });

  it('has no via-convoy group for a fleet or an inland army', () => {
    const fleet = controls({
      unit: F_ENG,
      order: moveOrder(F_ENG, 'BRE', null, false),
      reachable: [{ province: 'BRE', coasts: [] }],
    });
    expect(labels(fleet.select).map((g) => g.label)).toEqual([
      'Reachable Provinces',
    ]);
  });

  it('moves an adjacent target directly and a far one by convoy', () => {
    const { select, onUpdateOrder } = controls({ unitOptions: null });
    const order = moveOrder(A_BRE, 'PAR', null, false);
    fireEvent.change(select, { target: { value: 'GAS' } });
    expect(onUpdateOrder).toHaveBeenLastCalledWith({
      ...order,
      target: 'GAS',
      target_coast: null,
      via_convoy: false,
      is_explicit: true,
    });
    // Without server options every coastal province not reachable is offered by convoy.
    fireEvent.change(select, { target: { value: 'VIA:MAR' } });
    expect(onUpdateOrder).toHaveBeenLastCalledWith({
      ...order,
      target: 'MAR',
      target_coast: null,
      via_convoy: true,
      is_explicit: true,
    });
  });

  it('sends a fleet to a coast of the province', () => {
    const { select, onUpdateOrder } = controls({
      unit: F_ENG,
      order: moveOrder(F_ENG, 'BRE', null, false),
      reachable: [{ province: 'MAR', coasts: ['NC', 'SC'] }],
    });
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'MAR/NC',
      'MAR/SC',
    ]);
    fireEvent.change(select, { target: { value: 'MAR/SC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'MAR',
        target_coast: 'SC',
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('shows an adjacent province moved to by convoy as the via-convoy option', () => {
    const options: UnitMoveOptions = {
      ...OPTIONS_A_BRE,
      active_convoys: ['GAS'],
      potential_convoys: [],
    };
    const { select } = controls({
      order: moveOrder(A_BRE, 'GAS', null, true),
      unitOptions: options,
    });
    expect(select.value).toBe('VIA:GAS');
  });

  it('keeps the chosen via-convoy target in the list even when the server dropped it', () => {
    const { select } = controls({
      order: moveOrder(A_BRE, 'MAR', null, true),
      unitOptions: { ...OPTIONS_A_BRE, potential_convoys: [] },
    });
    expect(select.value).toBe('VIA:MAR');
  });

  it('shows a blank placeholder, not the first province, while a MOVE has no destination', () => {
    const blank = { ...moveOrder(A_BRE, 'PAR', null, false), target: null };
    for (const compact of [false, true]) {
      const { unmount } = render(
        <MoveControls
          unit={A_BRE}
          order={blank}
          provinces={MACRO_PROVINCES}
          reachable={REACHABLE}
          unitOptions={OPTIONS_A_BRE}
          compact={compact}
          useNativeSelect
          onUpdateOrder={vi.fn()}
        />,
      );
      const select = screen.getByTestId(
        'select-order-target',
      ) as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(select.selectedOptions[0].textContent).toMatch(/choose|move to/i);
      unmount();
    }
  });

  it('shows the placeholder while the order is still a hold', () => {
    const { select } = controls({ order: holdOrder(A_BRE) });
    expect(select.value).toBe('');
  });
});
