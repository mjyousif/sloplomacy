// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  ALL_UNITS,
  F_ENG,
  MACRO_PROVINCES,
  unitsByProvince,
} from '../../test/macroFixtures';
import { orderFor, unitAt } from '../../test/mapFixtures';
import type { OrderType } from '../../types/diplomacy';
import { OrderParameterControls } from './OrderParameterControls';

const controls = (
  unit = A_BRE,
  orderType: OrderType | null,
  isRetreatPhase = false,
  extra: Record<string, unknown> = {},
) =>
  render(
    <OrderParameterControls
      unit={unit}
      order={orderType ? orderFor(unit, orderType, extra) : undefined}
      provinces={MACRO_PROVINCES}
      units={ALL_UNITS}
      unitsByProv={unitsByProvince(ALL_UNITS)}
      orders={{}}
      reachable={[{ province: 'PAR', coasts: [] }]}
      validRetreats={[{ province: 'PAR', coasts: [] }]}
      unitOptions={null}
      isRetreatPhase={isRetreatPhase}
      onUpdateOrder={vi.fn()}
    />,
  ).container;

describe('OrderParameterControls picks the control for the order type', () => {
  it('shows the destination select for a MOVE', () => {
    controls(A_BRE, 'MOVE', false, { target: 'PAR' });
    expect(screen.getByTestId('select-order-target')).toBeInTheDocument();
  });

  it('shows the unit and target selects for a SUPPORT', () => {
    controls(A_BRE, 'SUPPORT', false, {
      aux_unit_origin: 'PAR',
      target: 'PAR',
    });
    expect(screen.getByTestId('select-support-unit')).toBeInTheDocument();
    expect(screen.getByTestId('select-support-target')).toBeInTheDocument();
  });

  it('shows the army and coast selects for a CONVOY', () => {
    const c = controls(F_ENG, 'CONVOY', false, {
      aux_unit_origin: 'BRE',
      target: 'LON',
    });
    expect(c.querySelectorAll('.order-param-row select')).toHaveLength(2);
    expect(c.textContent).toContain('Army:');
  });

  it('shows nothing for a HOLD, a DISBAND, or no order at all', () => {
    expect(controls(A_BRE, 'HOLD').innerHTML).toBe('');
    expect(controls(A_BRE, 'DISBAND').innerHTML).toBe('');
    expect(controls(A_BRE, null).innerHTML).toBe('');
  });

  describe('in a retreat phase', () => {
    const dislodged = unitAt('FRANCE', 'A', 'BRE', { is_dislodged: true });

    it('shows the retreat select for a RETREAT', () => {
      controls(dislodged, 'RETREAT', true, { target: 'PAR' });
      expect(screen.getByTestId('select-retreat-target')).toBeInTheDocument();
    });

    it('shows nothing for anything else, even a MOVE order left over', () => {
      expect(controls(dislodged, 'DISBAND', true).innerHTML).toBe('');
      expect(
        controls(dislodged, 'MOVE', true, { target: 'PAR' }).innerHTML,
      ).toBe('');
      expect(controls(dislodged, null, true).innerHTML).toBe('');
    });

    it('does not show the retreat select outside a retreat phase', () => {
      controls(dislodged, 'RETREAT', false, { target: 'PAR' });
      expect(screen.queryByTestId('select-retreat-target')).toBeNull();
    });
  });
});
