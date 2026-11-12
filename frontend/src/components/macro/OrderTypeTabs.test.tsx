// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { A_BRE, F_ENG, MACRO_PROVINCES } from '../../test/macroFixtures';
import { orderFor, unitAt } from '../../test/mapFixtures';
import { OrderTypeTabs } from './OrderTypeTabs';

const tabs = (over: Partial<Parameters<typeof OrderTypeTabs>[0]> = {}) => {
  const handleOrderTypeChange = vi.fn();
  const { container } = render(
    <OrderTypeTabs
      unit={A_BRE}
      order={undefined}
      provinces={MACRO_PROVINCES}
      validRetreats={[]}
      isDisbanding={false}
      isRetreatPhase={false}
      isAdjustmentPhase={false}
      buildCount={0}
      handleOrderTypeChange={handleOrderTypeChange}
      {...over}
    />,
  );
  return { container, handleOrderTypeChange };
};

const names = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).map((b) => b.textContent?.trim());

describe('OrderTypeTabs in a movement phase', () => {
  it('offers Hold, Move and Support to an army, with Hold active by default', () => {
    const { container } = tabs();
    expect(names(container)).toEqual(['HOLD', 'MOVE', 'SUPPORT']);
    expect(container.querySelector('.active')).toHaveTextContent('HOLD');
  });

  it('offers a convoy only to a fleet at sea', () => {
    expect(names(tabs({ unit: F_ENG }).container)).toEqual([
      'HOLD',
      'MOVE',
      'SUPPORT',
      'CONVOY',
    ]);
    const coastal = unitAt('FRANCE', 'F', 'BRE');
    expect(names(tabs({ unit: coastal }).container)).not.toContain('CONVOY');
  });

  it("marks the unit's current order type active", () => {
    const { container } = tabs({ order: orderFor(A_BRE, 'SUPPORT') });
    expect(container.querySelectorAll('.active')).toHaveLength(1);
    expect(container.querySelector('.active')).toHaveTextContent('SUPPORT');
  });

  it('asks for the type that was pressed', () => {
    const { handleOrderTypeChange } = tabs({ unit: F_ENG });
    fireEvent.click(screen.getByTestId('btn-order-type-CONVOY'));
    expect(handleOrderTypeChange).toHaveBeenCalledWith(F_ENG, 'CONVOY');
    fireEvent.click(screen.getByTestId('btn-order-type-MOVE'));
    expect(handleOrderTypeChange).toHaveBeenLastCalledWith(F_ENG, 'MOVE');
  });
});

describe('OrderTypeTabs in a retreat phase', () => {
  const dislodged = unitAt('FRANCE', 'A', 'PAR', { is_dislodged: true });
  const retreat = (over: Partial<Parameters<typeof OrderTypeTabs>[0]> = {}) =>
    tabs({ unit: dislodged, isRetreatPhase: true, ...over });

  it('shows nothing for a unit that was not dislodged', () => {
    expect(tabs({ isRetreatPhase: true }).container.innerHTML).toBe('');
  });

  it('offers Retreat and Disband when there is somewhere to go', () => {
    const { container, handleOrderTypeChange } = retreat({
      validRetreats: [{ province: 'BUR', coasts: [] }],
    });
    expect(names(container)).toEqual(['RETREAT', 'DISBAND']);
    fireEvent.click(screen.getByTestId('btn-order-retreat'));
    expect(handleOrderTypeChange).toHaveBeenCalledWith(dislodged, 'RETREAT');
  });

  it('offers only Disband when there is nowhere to retreat', () => {
    const { container, handleOrderTypeChange } = retreat();
    expect(names(container)).toEqual(['DISBAND']);
    fireEvent.click(screen.getByTestId('btn-order-disband'));
    expect(handleOrderTypeChange).toHaveBeenCalledWith(dislodged, 'DISBAND');
  });

  it('colours the chosen button: orange for Retreat, red for Disband', () => {
    const r = retreat({
      validRetreats: [{ province: 'BUR', coasts: [] }],
      order: orderFor(dislodged, 'RETREAT', { target: 'BUR' }),
    });
    expect(screen.getByTestId('btn-order-retreat')).toHaveStyle({
      backgroundColor: '#ea580c',
    });
    expect(screen.getByTestId('btn-order-disband')).not.toHaveStyle({
      backgroundColor: '#dc2626',
    });
    r.container.remove();
    const d = retreat({ order: orderFor(dislodged, 'DISBAND') });
    expect(d.container.querySelector('.active')).toHaveStyle({
      backgroundColor: '#dc2626',
    });
    expect(
      (d.container.querySelector('.active') as HTMLElement).style.borderColor,
    ).toBe('rgb(252, 165, 165)');
  });
});

describe('OrderTypeTabs in winter', () => {
  const winter = (over: Partial<Parameters<typeof OrderTypeTabs>[0]> = {}) =>
    tabs({ isAdjustmentPhase: true, ...over });

  it('shows nothing when no disbands are owed', () => {
    expect(winter({ buildCount: 0 }).container.innerHTML).toBe('');
    expect(winter({ buildCount: 2 }).container.innerHTML).toBe('');
    // A build table entry without a count owes nothing, as before.
    expect(winter({ buildCount: Number.NaN }).container.innerHTML).toBe('');
  });

  it('offers Keep or Disband when units must go, and Keep is active', () => {
    const { container, handleOrderTypeChange } = winter({ buildCount: -1 });
    expect(names(container)).toEqual(['KEEP UNIT', 'DISBAND UNIT']);
    expect(container.querySelector('.active')).toHaveTextContent('KEEP UNIT');
    fireEvent.click(screen.getByTestId('btn-adjustment-keep'));
    expect(handleOrderTypeChange).toHaveBeenCalledWith(A_BRE, 'HOLD');
    fireEvent.click(screen.getByTestId('btn-adjustment-disband'));
    expect(handleOrderTypeChange).toHaveBeenLastCalledWith(A_BRE, 'DISBAND');
  });

  it('moves the active mark to Disband, in red, for a unit being disbanded', () => {
    const { container } = winter({ buildCount: -1, isDisbanding: true });
    expect(container.querySelector('.active')).toHaveTextContent(
      'DISBAND UNIT',
    );
    expect(container.querySelector('.active')).toHaveStyle({
      backgroundColor: '#dc2626',
    });
    expect(
      (container.querySelector('.active') as HTMLElement).style.borderColor,
    ).toBe('rgb(252, 165, 165)');
  });
});
