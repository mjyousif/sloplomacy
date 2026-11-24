// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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

const nativeControls = (
  over: Partial<Parameters<typeof ConvoyControls>[0]> = {},
  onUpdateOrder = vi.fn<(o: Order) => void>(),
) => {
  const { container } = render(
    <ConvoyControls
      order={convoyOrder(F_ENG, 'BRE', 'LON')}
      provinces={MACRO_PROVINCES}
      units={ALL_UNITS}
      unitOptions={OPTIONS}
      useNativeSelect
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
  it('groups the armies by how the fleet reaches them in native mode', () => {
    const { army } = nativeControls();
    expect(army.value).toBe('BRE');
    expect(groups(army)).toEqual([
      { label: 'Adjacent Shore', options: ['BRE'] },
      { label: 'Via Fleet Chain', options: ['PIC'] },
    ]);
    expect(army.options[0].textContent).toBe('A Brest');
  });

  it('groups the targets of the chosen army', () => {
    const { target } = nativeControls();
    expect(target.value).toBe('LON');
    expect(groups(target)).toEqual([
      { label: 'Direct / Ready Chain', options: ['LON'] },
      { label: 'Multi-Ship Chain', options: ['PIC'] },
    ]);
  });

  it('leaves out an empty group', () => {
    const { army, target } = nativeControls({
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
    const { army, onUpdateOrder } = nativeControls();
    fireEvent.change(army, { target: { value: 'PIC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'MAR' }),
    );
  });

  it('keeps a target the new army can also reach', () => {
    const { army, onUpdateOrder } = nativeControls({
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
    const { target, onUpdateOrder } = nativeControls();
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
      const { army, target } = nativeControls(noOptions);
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
      const { army, onUpdateOrder } = nativeControls(noOptions);
      fireEvent.change(army, { target: { value: 'PIC' } });
      expect(onUpdateOrder).toHaveBeenCalledWith(
        expect.objectContaining({ aux_unit_origin: 'PIC', target: 'LON' }),
      );
    });

    it('lists no armies when none stand on a coast', () => {
      const { army } = nativeControls({ ...noOptions, units: [F_ENG] });
      expect(army.options).toHaveLength(0);
    });
  });

  it('shows blank placeholders until an army and a destination are chosen', () => {
    const blank: Order = {
      ...convoyOrder(F_ENG, 'BRE', 'LON'),
      aux_unit_origin: null,
      target: null,
    };
    const { army, target } = nativeControls({ order: blank });
    expect(army.value).toBe('');
    expect(army.selectedOptions[0].textContent).toMatch(/army/i);
    expect(target.value).toBe('');
    expect(target.selectedOptions[0].textContent).toMatch(/to/i);
  });

  it('uses shared army-change logic and hover callbacks in custom dropdown mode', () => {
    const onUpdateOrder = vi.fn();
    const onHoverProvince = vi.fn();
    render(
      <ConvoyControls
        order={convoyOrder(F_ENG, 'BRE', 'LON')}
        provinces={MACRO_PROVINCES}
        units={ALL_UNITS}
        unitOptions={OPTIONS}
        compact
        onUpdateOrder={onUpdateOrder}
        onHoverProvince={onHoverProvince}
      />,
    );

    const armyTrigger = screen.getByRole('button', { name: 'Convoyed army' });
    fireEvent.click(armyTrigger);
    const picOpt = screen.getByRole('option', { name: 'A Picardy' });
    fireEvent.pointerEnter(picOpt, { pointerType: 'mouse' });
    expect(onHoverProvince).toHaveBeenLastCalledWith('PIC');
    fireEvent.click(picOpt);
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'MAR' }),
    );
  });
});
