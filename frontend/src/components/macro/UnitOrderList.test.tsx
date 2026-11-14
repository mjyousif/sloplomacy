// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
    ).toHaveTextContent('ACTIVE FORCE ORDERS (3 UNITS)');
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
      expect(headers[1]).toHaveTextContent('ACTIVE FORCE ORDERS (3 UNITS)');
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
  });
});
