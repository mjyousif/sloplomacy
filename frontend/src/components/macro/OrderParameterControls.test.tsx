// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, unitAt } from '../../test/mapFixtures';
import type { Order, UnitMoveOptions } from '../../types/diplomacy';
import { moveOrder } from '../../utils/orderBuilders';
import { OrderParameterControls } from './OrderParameterControls';

describe('OrderParameterControls with UnitMoveOptions', () => {
  const A_BRE = unitAt('FRANCE', 'A', 'BRE');
  const A_PAR = unitAt('FRANCE', 'A', 'PAR');

  it('distinguishes adjacent land move from adjacent via-convoy move in Destination select', () => {
    const onUpdateOrder = vi.fn<(o: Order) => void>();
    const unitOptions: UnitMoveOptions = {
      direct_moves: ['GAS', 'PAR', 'PIC'],
      active_convoys: ['GAS'],
      potential_convoys: ['MAR'],
      convoy_targets: {},
      valid_supports: [],
    };
    const { rerender } = render(
      <OrderParameterControls
        unit={A_BRE}
        order={moveOrder(A_BRE, 'GAS', null, false)}
        provinces={FRANCE_PROVINCES}
        units={[A_BRE, A_PAR]}
        unitsByProv={{ BRE: A_BRE, PAR: A_PAR }}
        orders={{}}
        reachable={[{ province: 'GAS', coasts: [] }]}
        validRetreats={[]}
        unitOptions={unitOptions}
        isRetreatPhase={false}
        onUpdateOrder={onUpdateOrder}
      />,
    );

    const select = screen.getByTestId(
      'select-order-target',
    ) as HTMLSelectElement;
    expect(select.value).toBe('GAS');

    // Selecting VIA:GAS sends via_convoy: true even though GAS is adjacent!
    fireEvent.change(select, { target: { value: 'VIA:GAS' } });
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'GAS', via_convoy: true }),
    );

    rerender(
      <OrderParameterControls
        unit={A_BRE}
        order={moveOrder(A_BRE, 'GAS', null, true)}
        provinces={FRANCE_PROVINCES}
        units={[A_BRE, A_PAR]}
        unitsByProv={{ BRE: A_BRE, PAR: A_PAR }}
        orders={{}}
        reachable={[{ province: 'GAS', coasts: [] }]}
        validRetreats={[]}
        unitOptions={unitOptions}
        isRetreatPhase={false}
        onUpdateOrder={onUpdateOrder}
      />,
    );
    expect(select.value).toBe('VIA:GAS');
  });

  it('filters SUPPORT units and destinations to unitOptions.valid_supports', () => {
    const A_MAR_ITA = unitAt('ITALY', 'A', 'MAR');
    const unitOptions: UnitMoveOptions = {
      direct_moves: ['GAS', 'PAR'],
      active_convoys: [],
      potential_convoys: [],
      convoy_targets: {},
      valid_supports: [
        { unit_id: A_PAR.id, province: 'PAR', hold: true, moves: ['GAS'] },
      ],
    };
    render(
      <OrderParameterControls
        unit={A_BRE}
        order={{
          unit_id: A_BRE.id,
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'BRE',
          order_type: 'SUPPORT',
          aux_unit_origin: 'PAR',
          target: 'GAS',
          via_convoy: false,
          is_explicit: true,
        }}
        provinces={FRANCE_PROVINCES}
        units={[A_BRE, A_PAR, A_MAR_ITA]}
        unitsByProv={{ BRE: A_BRE, PAR: A_PAR, MAR: A_MAR_ITA }}
        orders={{}}
        reachable={[]}
        validRetreats={[]}
        unitOptions={unitOptions}
        isRetreatPhase={false}
        onUpdateOrder={vi.fn()}
      />,
    );

    const supUnitSelect = screen.getByTestId('select-support-unit');
    expect(supUnitSelect.querySelectorAll('option')).toHaveLength(1);
    expect(supUnitSelect.textContent).toContain('Paris');
    expect(supUnitSelect.textContent).not.toContain('Marseilles');
  });
});
