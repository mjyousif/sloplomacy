// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ALL_UNITS, F_ENG, MACRO_PROVINCES } from '../../../test/macroFixtures';
import type { Order, UnitMoveOptions } from '../../../types/diplomacy';
import { convoyOrder } from '../../../utils/orderBuilders';
import { ConvoyControls } from './ConvoyControls';

const OPTIONS: UnitMoveOptions = {
  direct_moves: [],
  active_convoys: [],
  potential_convoys: [],
  convoyable_armies: { direct: ['BRE'], chained: ['PIC'] },
  convoy_targets: {
    BRE: { direct: ['LON'], chained: ['PIC'] },
    PIC: { direct: ['MAR'], chained: [] },
  },
  valid_supports: [],
};

const controls = (
  over: Partial<Parameters<typeof ConvoyControls>[0]> = {},
  onUpdateOrder = vi.fn<(o: Order) => void>(),
) => {
  const { container } = render(
    <ConvoyControls
      order={convoyOrder(F_ENG, 'BRE', 'LON')}
      provinces={MACRO_PROVINCES}
      units={ALL_UNITS}
      unitOptions={OPTIONS}
      onUpdateOrder={onUpdateOrder}
      {...over}
    />,
  );
  const [army, target] = Array.from(
    container.querySelectorAll('select'),
  ) as HTMLSelectElement[];
  return { army, target, onUpdateOrder };
};

const groups = (select: HTMLSelectElement) =>
  Array.from(select.querySelectorAll('optgroup')).map((g) => ({
    label: g.label,
    options: Array.from(g.querySelectorAll('option')).map((o) => o.value),
  }));

describe('ConvoyControls', () => {
  it('groups the armies by how the fleet reaches them', () => {
    const { army } = controls();
    expect(army.value).toBe('BRE');
    expect(groups(army)).toEqual([
      { label: 'Adjacent Shore', options: ['BRE'] },
      { label: 'Via Fleet Chain', options: ['PIC'] },
    ]);
    expect(army.options[0].textContent).toBe('A Brest (BRE)');
  });

  it('groups the targets of the chosen army', () => {
    const { target } = controls();
    expect(target.value).toBe('LON');
    expect(groups(target)).toEqual([
      { label: 'Direct / Ready Chain', options: ['LON'] },
      { label: 'Multi-Ship Chain', options: ['PIC'] },
    ]);
  });

  it('leaves out an empty group', () => {
    const { army, target } = controls({
      order: convoyOrder(F_ENG, 'PIC', 'MAR'),
      unitOptions: {
        ...OPTIONS,
        convoyable_armies: { direct: [], chained: ['PIC'] },
      },
    });
    expect(groups(army).map((g) => g.label)).toEqual(['Via Fleet Chain']);
    expect(groups(target).map((g) => g.label)).toEqual([
      'Direct / Ready Chain',
    ]);
  });

  it('moves the target to the first one the new army can reach when it cannot keep it', () => {
    const { army, onUpdateOrder } = controls();
    fireEvent.change(army, { target: { value: 'PIC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'MAR' }),
    );
  });

  it('keeps a target the new army can also reach', () => {
    const { army, onUpdateOrder } = controls({
      order: convoyOrder(F_ENG, 'BRE', 'PIC'),
      unitOptions: {
        ...OPTIONS,
        convoy_targets: {
          ...OPTIONS.convoy_targets,
          PIC: { direct: ['MAR'], chained: ['PIC'] },
        },
      },
    });
    fireEvent.change(army, { target: { value: 'PIC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'PIC' }),
    );
  });

  it('changes only the target from the To Coast select', () => {
    const { target, onUpdateOrder } = controls();
    fireEvent.change(target, { target: { value: 'PIC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith({
      ...convoyOrder(F_ENG, 'BRE', 'LON'),
      target: 'PIC',
      is_explicit: true,
    });
  });

  describe('without server options', () => {
    const noOptions = {
      unitOptions: null,
      order: convoyOrder(F_ENG, 'BRE', 'LON'),
    };

    it('offers the coastal armies, and the coastal provinces but their own', () => {
      const { army, target } = controls(noOptions);
      // Brest is the only coastal army; the English one in Picardy counts too.
      expect(Array.from(army.options).map((o) => o.value)).toEqual([
        'BRE',
        'PIC',
      ]);
      expect(Array.from(target.options).map((o) => o.value)).toEqual([
        'PIC',
        'GAS',
        'MAR',
        'LON',
      ]);
    });

    it('falls back to the first coastal province for an army with no entry', () => {
      const { army, onUpdateOrder } = controls(noOptions);
      fireEvent.change(army, { target: { value: 'PIC' } });
      expect(onUpdateOrder).toHaveBeenCalledWith(
        expect.objectContaining({ aux_unit_origin: 'PIC', target: 'LON' }),
      );
    });

    it('lists no armies when none stand on a coast', () => {
      const { army } = controls({ ...noOptions, units: [F_ENG] });
      expect(army.options).toHaveLength(0);
    });
  });

  it('shows blank placeholders until an army and a destination are chosen', () => {
    const blank: Order = {
      ...convoyOrder(F_ENG, 'BRE', 'LON'),
      aux_unit_origin: null,
      target: null,
    };
    const { army, target } = controls({ order: blank });
    expect(army.value).toBe('');
    expect(army.selectedOptions[0].textContent).toMatch(/choose/i);
    expect(target.value).toBe('');
    expect(target.selectedOptions[0].textContent).toMatch(/choose/i);
  });
});
