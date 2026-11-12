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

const controls = (
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
  it('without server options offers every other standing unit, tagged by power', () => {
    const { unitSelect } = controls();
    expect(Array.from(unitSelect.options).map((o) => o.textContent)).toEqual([
      '[France] A Paris (PAR)',
      '[France] F English Channel (ENG)',
      '[England] A Picardy (PIC)',
    ]);
    expect(unitSelect.value).toBe('PAR');
  });

  it('without server options leaves out dislodged units', () => {
    const dislodged = { ...A_PAR, is_dislodged: true };
    const { unitSelect } = controls({ units: [dislodged, A_BRE] });
    expect(unitSelect.options).toHaveLength(0);
  });

  it('offers a hold and moves into the neighbours the unit can reach', () => {
    const { intoSelect } = controls();
    expect(Array.from(intoSelect.options).map((o) => o.textContent)).toEqual([
      'HOLD in Paris (PAR)',
      '→ Gascony (GAS)',
      '→ Picardy (PIC)',
    ]);
  });

  it("takes the server's supportable units and the moves it allows", () => {
    const { unitSelect, intoSelect } = controls({
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
    const { unitSelect, onUpdateOrder } = controls({
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
    const { unitSelect, onUpdateOrder } = controls({
      order: supportOrder(A_BRE, 'PAR', 'GAS'),
      orders: { [A_PAR.id]: orderFor(A_PAR, 'HOLD') },
    });
    fireEvent.change(unitSelect, { target: { value: 'PAR' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ aux_unit_origin: 'PAR', target: 'PAR' }),
    );
  });

  it('ignores a move the server does not allow, and falls back to its first move', () => {
    const { unitSelect, onUpdateOrder } = controls({
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
    const { intoSelect, onUpdateOrder } = controls();
    const order = supportOrder(A_BRE, 'PAR', 'PAR');
    fireEvent.change(intoSelect, { target: { value: 'GAS' } });
    expect(onUpdateOrder).toHaveBeenCalledWith({
      ...order,
      target: 'GAS',
      is_explicit: true,
    });
  });
});
