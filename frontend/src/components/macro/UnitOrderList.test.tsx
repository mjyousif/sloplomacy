// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  F_ENG,
  HOLD_ORDERS,
  issue,
  MACRO_PROVINCES,
  OPTIONS_A_BRE,
  progressFor,
} from '../../test/macroFixtures';
import { orderFor, unitAt } from '../../test/mapFixtures';
import { POWER_METADATA, type SimulationResult } from '../../types/diplomacy';
import { UnitOrderList } from './UnitOrderList';

type Props = Parameters<typeof UnitOrderList>[0];

const list = (
  over: Partial<Props> = {},
  progressOver: Parameters<typeof progressFor>[0] = {},
) => {
  const fns = {
    onSelectUnit: vi.fn(),
    onHoverUnit: vi.fn(),
    onHighlightProvinces: vi.fn(),
    onUpdateOrder: vi.fn(),
  };
  const orders = over.orders ?? HOLD_ORDERS;
  const view = render(
    <UnitOrderList
      activePower="FRANCE"
      powerMeta={POWER_METADATA.FRANCE}
      progress={progressFor({ orders, ...progressOver })}
      provinces={MACRO_PROVINCES}
      units={ALL_UNITS}
      orders={orders}
      retreats={null}
      unitOptions={null}
      selectedUnitId={null}
      hoveredUnitId={null}
      simulationResult={null}
      simActive={false}
      isAdjustmentPhase={false}
      isRetreatPhase={false}
      isSheet={false}
      {...fns}
      {...over}
    />,
  );
  return { ...view, ...fns };
};

const cards = (c: HTMLElement) =>
  Array.from(
    c.querySelectorAll<HTMLElement>('[data-testid="unit-macro-card"]'),
  );

describe('UnitOrderList', () => {
  it('lists a card per unit of the power, headed by the unit count', () => {
    const { container } = list();
    expect(cards(container).map((c) => c.dataset.unitId)).toEqual([
      A_PAR.id,
      A_BRE.id,
      F_ENG.id,
    ]);
    expect(
      container.querySelector('[data-testid="macro-list-header"]'),
    ).toHaveTextContent('ACTIVE ORDERS');
  });

  it('shows the unit and center counts in the sticky header, not the phone sheet', () => {
    const { container } = list();
    const header = container.querySelector(
      '[data-testid="macro-list-header"]',
    ) as HTMLElement;
    expect(header.dataset.sticky).toBe('true');
    expect(within(header).getByTestId('macro-unit-counts')).toHaveTextContent(
      '3 Units • 3 SCs',
    );
    const sheet = list({ isSheet: true }).container;
    expect(sheet.querySelector('[data-testid="macro-unit-counts"]')).toBeNull();
  });

  it('adds the dislodged units to the count', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    list({}, { units: [A_PAR, dislodged], isRetreatPhase: true });
    expect(screen.getAllByTestId('macro-unit-counts')[0]).toHaveTextContent(
      '1 Units (+1 Dislodged) • 3 SCs',
    );
  });

  it('words the hint for a finger on the phone sheet', () => {
    expect(
      list().container.querySelector('[data-testid="macro-hint"]'),
    ).toHaveTextContent('Click card or map');
    expect(
      list({ isSheet: true }).container.querySelector(
        '[data-testid="macro-hint"]',
      ),
    ).toHaveTextContent('Tap a card or the map');
  });

  it('marks the selected and the hovered card', () => {
    const { container } = list({
      selectedUnitId: A_BRE.id,
      hoveredUnitId: F_ENG.id,
    });
    const [par, bre, eng] = cards(container);
    expect(par).not.toHaveAttribute('data-selected');
    expect(par).not.toHaveAttribute('data-hovered');
    expect(bre).toHaveAttribute('data-selected', 'true');
    expect(eng).toHaveAttribute('data-hovered', 'true');
  });

  it('hands each card its own issues and colours it by severity', () => {
    const { container } = list(
      {},
      { issues: [issue(A_PAR, 'error'), issue(A_BRE, 'warning')] },
    );
    const [par, bre, eng] = cards(container);
    expect(par).toHaveAttribute('data-status', 'error');
    expect(
      par.querySelectorAll('[data-testid="unit-diagnostic-alert"]'),
    ).toHaveLength(1);
    expect(bre).toHaveAttribute('data-status', 'warning');
    expect(eng).not.toHaveAttribute('data-status');
  });

  it('holds back the warning for the selected unit until its order is finished or it is deselected', () => {
    const blank = {
      ...orderFor(A_BRE, 'MOVE', { target: 'PAR' }),
      target: null,
    };
    const orders = { ...HOLD_ORDERS, [A_BRE.id]: blank };
    const issues = [issue(A_BRE, 'error')];
    const picked = list({ orders, selectedUnitId: A_BRE.id }, { issues });
    expect(cards(picked.container)[1]).not.toHaveAttribute('data-status');
    picked.unmount();
    const off = list({ orders, selectedUnitId: null }, { issues });
    expect(cards(off.container)[1]).toHaveAttribute('data-status', 'error');
  });

  it('shows the simulation result only while the simulation is on', () => {
    const simulationResult = {
      resolutions: {
        [A_PAR.id]: { succeeded: true, reason: 'Held.' },
      },
    } as unknown as SimulationResult;
    expect(
      list({ simulationResult, simActive: false }).container.querySelector(
        '[data-testid="unit-sim-result-strip"]',
      ),
    ).toBeNull();
    const { container } = list({ simulationResult, simActive: true });
    expect(
      container.querySelectorAll('[data-testid="unit-sim-result-strip"]'),
    ).toHaveLength(1);
    expect(
      cards(container)[0].querySelector(
        '[data-testid="unit-sim-result-strip"]',
      ),
    ).not.toBeNull();
  });

  it('puts the dislodged unit first in a retreat phase and offers it a retreat', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const units = [A_PAR, dislodged];
    const { container } = list(
      {
        units,
        isRetreatPhase: true,
        retreats: { FRANCE: { 'A MAR': ['GAS'] } } as never,
        unitOptions: {
          [dislodged.id]: { ...OPTIONS_A_BRE, direct_moves: ['GAS'] },
        },
      },
      { units, isRetreatPhase: true },
    );
    expect(cards(container)[0].dataset.unitId).toBe(dislodged.id);
    expect(screen.getByTestId('btn-order-retreat')).toBeInTheDocument();
  });

  describe('picking an order type', () => {
    it('opens a MOVE with no destination, even when the unit has options', () => {
      const { onUpdateOrder } = list({
        unitOptions: {
          [A_BRE.id]: { ...OPTIONS_A_BRE, direct_moves: ['GAS'] },
        },
      });
      const bre = cards(document.body)[1];
      fireEvent.click(
        bre.querySelector('[data-testid="btn-order-type-MOVE"]') as HTMLElement,
      );
      expect(onUpdateOrder).toHaveBeenCalledWith(
        orderFor(A_BRE, 'MOVE', { target: null, via_convoy: false }),
      );
    });

    it('sends a hold, without options, for Hold', () => {
      const { onUpdateOrder } = list({
        orders: {
          ...HOLD_ORDERS,
          [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'BUR' }),
        },
      });
      fireEvent.click(
        cards(document.body)[0].querySelector(
          '[data-testid="btn-order-type-HOLD"]',
        ) as HTMLElement,
      );
      expect(onUpdateOrder).toHaveBeenCalledWith(orderFor(A_PAR, 'HOLD'));
    });
  });

  it('retreats to the first province the server listed when there are no move options', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const units = [A_PAR, dislodged];
    const { onUpdateOrder } = list(
      {
        units,
        isRetreatPhase: true,
        retreats: { FRANCE: { 'A MAR': ['GAS', 'BUR'] } } as never,
      },
      { units, isRetreatPhase: true },
    );
    fireEvent.click(screen.getByTestId('btn-order-retreat'));
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: 'RETREAT', target: 'GAS' }),
    );
  });

  describe('in winter', () => {
    const owed = (count: number, homes: string[]) => ({
      FRANCE: { count, homes },
    });

    it('lists a build slot per open home, headed by how many are assigned', () => {
      const builds = owed(2, ['MAR', 'BRE']) as never;
      const { container } = list(
        { isAdjustmentPhase: true },
        { isAdjustmentPhase: true, builds },
      );
      const headers = container.querySelectorAll(
        '[data-testid="macro-list-header"]',
      );
      expect(headers[0]).toHaveTextContent('HOME BUILDS (0/2 ASSIGNED)');
      expect(
        Array.from(
          container.querySelectorAll<HTMLElement>(
            '[data-testid="build-macro-card"]',
          ),
        ).map((c) => c.dataset.homeProvince),
      ).toEqual(['MAR', 'BRE']);
      expect(headers[1]).toHaveTextContent('ACTIVE ORDERS');
    });

    it('words the build hint for a finger on the phone sheet', () => {
      const { container } = list(
        { isAdjustmentPhase: true, isSheet: true },
        { isAdjustmentPhase: true, builds: owed(1, ['MAR']) as never },
      );
      expect(
        container.querySelector(
          '[data-testid="macro-builds-wrapper"] [data-testid="macro-hint"]',
        ),
      ).toHaveTextContent('Tap a card or the map');
    });

    it('has no build slots when no home is free', () => {
      const { container } = list(
        { isAdjustmentPhase: true },
        { isAdjustmentPhase: true, builds: owed(1, []) as never },
      );
      expect(
        container.querySelector('[data-testid="macro-builds-wrapper"]'),
      ).toBeNull();
    });

    it('headlines the disbands when units must go', () => {
      const { container } = list(
        { isAdjustmentPhase: true },
        { isAdjustmentPhase: true, builds: owed(-1, []) as never },
      );
      expect(
        container.querySelector('[data-testid="macro-list-header"]'),
      ).toHaveTextContent('DISBAND UNITS (0/1 SELECTED)');
    });

    it('gives each card the keep and disband choice when units must go', () => {
      list(
        { isAdjustmentPhase: true },
        { isAdjustmentPhase: true, builds: owed(-1, []) as never },
      );
      expect(screen.getAllByTestId('btn-adjustment-keep')).toHaveLength(3);
    });

    it('selects a build slot by its id', () => {
      const { onSelectUnit } = list(
        { isAdjustmentPhase: true },
        { isAdjustmentPhase: true, builds: owed(1, ['MAR']) as never },
      );
      fireEvent.click(screen.getByTestId('build-macro-card'));
      expect(onSelectUnit).toHaveBeenCalledWith('BUILD_FRANCE_MAR');
    });

    it('keeps the compact toggle and renders compact build and retained rows in winter', () => {
      const onToggleCompactOrders = vi.fn();
      const { container } = list(
        {
          isAdjustmentPhase: true,
          compactOrders: true,
          onToggleCompactOrders,
        },
        { isAdjustmentPhase: true, builds: owed(1, ['MAR']) as never },
      );
      expect(screen.getByTestId('btn-toggle-compact-orders')).toHaveTextContent(
        'Detailed',
      );
      expect(screen.getByTestId('build-compact-row')).toBeInTheDocument();
      expect(screen.getByTestId('btn-build-army')).toHaveTextContent('+A');
      expect(screen.getByTestId('btn-build-waive')).toHaveTextContent('Waive');
      expect(
        container.querySelectorAll('[data-testid="unit-compact-row"]'),
      ).toHaveLength(3);
    });
  });

  it('keeps the compact toggle in retreats', () => {
    const onToggleCompactOrders = vi.fn();
    list(
      {
        isRetreatPhase: true,
        compactOrders: true,
        onToggleCompactOrders,
      },
      { isRetreatPhase: true },
    );
    expect(screen.getByTestId('btn-toggle-compact-orders')).toHaveTextContent(
      'Detailed',
    );
  });
});
