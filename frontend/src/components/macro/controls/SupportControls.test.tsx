// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  MACRO_PROVINCES,
  unitsByProvince,
} from '../../../test/macroFixtures';
import { orderFor } from '../../../test/mapFixtures';
import type { Order, UnitMoveOptions } from '../../../types/diplomacy';
import { moveOrder, supportOrder } from '../../../utils/orderBuilders';
import { SupportControls } from './SupportControls';

const REACHABLE = [
  { province: 'PAR', coasts: [] },
  { province: 'GAS', coasts: [] },
  { province: 'PIC', coasts: [] },
];

const nativeControls = (
  over: Partial<Parameters<typeof SupportControls>[0]> = {},
  onUpdateOrder = vi.fn<(o: Order) => void>(),
) => {
  render(
    <SupportControls
      unit={A_BRE}
      order={supportOrder(A_BRE, 'PAR', 'PAR')}
      provinces={MACRO_PROVINCES}
      units={ALL_UNITS}
      unitsByProv={unitsByProvince(ALL_UNITS)}
      orders={{}}
      reachable={REACHABLE}
      unitOptions={null}
      useNativeSelect
      onUpdateOrder={onUpdateOrder}
      {...over}
    />,
  );
  return {
    unitSelect: screen.getByTestId('select-support-unit') as HTMLSelectElement,
    intoSelect: screen.getByTestId(
      'select-support-target',
    ) as HTMLSelectElement,
    onUpdateOrder,
  };
};

const SERVER_OPTIONS: UnitMoveOptions = {
  direct_moves: [],
  active_convoys: [],
  potential_convoys: [],
  convoyable_armies: null,
  convoy_targets: {},
  valid_supports: [
    { unit_id: A_PAR.id, province: 'PAR', hold: true, moves: ['GAS'] },
    { unit_id: 'ENGLAND_A_PIC', province: 'PIC', hold: false, moves: ['PAR'] },
  ],
};

describe('SupportControls', () => {
  it('without server options offers every other standing unit in native mode', () => {
    const { unitSelect } = nativeControls();
    expect(Array.from(unitSelect.options).map((o) => o.textContent)).toEqual([
      'A Paris',
      'F English Channel',
      'A Picardy',
    ]);
    expect(unitSelect.value).toBe('PAR');
  });

  it('without server options leaves out dislodged units', () => {
    const dislodged = { ...A_PAR, is_dislodged: true };
    const { unitSelect } = nativeControls({ units: [dislodged, A_BRE] });
    expect(unitSelect.options).toHaveLength(0);
  });

  it('offers a hold and moves into the neighbours the unit can reach', () => {
    const { intoSelect } = nativeControls();
    expect(Array.from(intoSelect.options).map((o) => o.textContent)).toEqual([
      'Hold (Paris)',
      'Gascony',
      'Picardy',
    ]);
  });

  it("takes the server's supportable units and the moves it allows", () => {
    const { unitSelect, intoSelect } = nativeControls({
      order: supportOrder(A_BRE, 'PIC', 'PAR'),
      unitOptions: SERVER_OPTIONS,
    });
    expect(Array.from(unitSelect.options).map((o) => o.value)).toEqual([
      'PAR',
      'PIC',
    ]);
    // Picardy cannot be held, so only its one move is offered.
    expect(Array.from(intoSelect.options).map((o) => o.value)).toEqual(['PAR']);
  });

  it('picking a unit that is moving supports that move', () => {
    const { unitSelect, onUpdateOrder } = nativeControls({
      orders: { [A_PAR.id]: moveOrder(A_PAR, 'GAS', null, false) },
    });
    fireEvent.change(unitSelect, { target: { value: 'PAR' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        aux_unit_origin: 'PAR',
        target: 'GAS',
        is_explicit: true,
      }),
    );
  });

  it('picking a unit that holds supports it to hold', () => {
    const { unitSelect, onUpdateOrder } = nativeControls({
      order: supportOrder(A_BRE, 'PAR', 'GAS'),
      orders: { [A_PAR.id]: orderFor(A_PAR, 'HOLD') },
    });
    fireEvent.change(unitSelect, { target: { value: 'PAR' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PAR', target: 'PAR' }),
    );
  });

  it('ignores a move the server does not allow, and falls back to its first move', () => {
    const { unitSelect, onUpdateOrder } = nativeControls({
      order: supportOrder(A_BRE, 'PAR', 'GAS'),
      orders: {
        ENGLAND_A_PIC: orderFor(ALL_UNITS[3], 'MOVE', { target: 'BUR' }),
      },
      unitOptions: SERVER_OPTIONS,
    });
    // Picardy is moving to Burgundy, which the server did not list: use its first move.
    fireEvent.change(unitSelect, { target: { value: 'PIC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'PAR' }),
    );
  });

  it('changes only the target from the Into select', () => {
    const { intoSelect, onUpdateOrder } = nativeControls();
    const order = supportOrder(A_BRE, 'PAR', 'PAR');
    fireEvent.change(intoSelect, { target: { value: 'GAS' } });
    expect(onUpdateOrder).toHaveBeenCalledWith({
      ...order,
      target: 'GAS',
      is_explicit: true,
    });
  });

  it('shows blank placeholders until a unit and a target are chosen', () => {
    const blank: Order = {
      ...supportOrder(A_BRE, 'PAR', 'PAR'),
      aux_unit_origin: null,
      target: null,
    };
    const { unitSelect, intoSelect } = nativeControls({ order: blank });
    expect(unitSelect.value).toBe('');
    expect(unitSelect.selectedOptions[0].textContent).toMatch(/unit/i);
    expect(intoSelect.value).toBe('');
    expect(intoSelect.selectedOptions[0].textContent).toMatch(/into/i);
  });

  it('renders custom IconSelectDropdown with hover preview in desktop mode', () => {
    const onUpdateOrder = vi.fn();
    const onHoverProvince = vi.fn();
    render(
      <SupportControls
        unit={A_BRE}
        order={supportOrder(A_BRE, 'PAR', 'PAR')}
        provinces={MACRO_PROVINCES}
        units={ALL_UNITS}
        unitsByProv={unitsByProvince(ALL_UNITS)}
        orders={{}}
        reachable={REACHABLE}
        unitOptions={SERVER_OPTIONS}
        compact
        onUpdateOrder={onUpdateOrder}
        onHoverProvince={onHoverProvince}
      />,
    );

    const unitTrigger = screen.getByTestId('select-support-unit');
    expect(unitTrigger.tagName).toBe('BUTTON');
    fireEvent.click(unitTrigger);
    const picOpt = screen.getByRole('option', { name: /A Picardy/ });
    fireEvent.pointerEnter(picOpt, { pointerType: 'mouse' });
    expect(onHoverProvince).toHaveBeenLastCalledWith('PIC');
    fireEvent.click(picOpt);
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PIC', target: 'PAR' }),
    );
  });
});
