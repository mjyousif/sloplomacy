// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '../../../data/europeMapGeometry';
import { FRANCE_PROVINCES, orderFor, unitAt } from '../../../test/mapFixtures';
import type {
  Order,
  OrderResolution,
  SimulationResult,
  Unit,
  ValidationIssue,
} from '../../../types/diplomacy';
import { getPieceFrame } from '../../MapPiece';
import { UnitsLayer } from './UnitsLayer';
import type { UnitLayerContext } from './units/unitLayerContext';

const POINTS: Record<string, Point> = {
  PAR: { x: 560, y: 760 },
  BUR: { x: 640, y: 780 },
  MAR: { x: 620, y: 1000 },
};
const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_BUR_GER = unitAt('GERMANY', 'A', 'BUR');
const A_MAR = unitAt('FRANCE', 'A', 'MAR');

function draw(units: Unit[], ctx: Partial<UnitLayerContext> = {}) {
  const unitsByProv: Record<string, Unit> = {};
  for (const u of units) if (!u.is_dislodged) unitsByProv[u.province] = u;
  const full: UnitLayerContext = {
    orders: {},
    provinces: FRANCE_PROVINCES,
    ownership: {},
    unitsByProv,
    controlPower: 'FRANCE',
    canEditAnyPower: false,
    activePower: 'FRANCE',
    selectedUnit: null,
    hoveredUnitId: null,
    isUnitOrderVisible: (u) => u.power === 'FRANCE',
    issuesByUnit: {},
    supportCountByUnitId: {},
    showSimulationOverlay: false,
    sandboxMode: false,
    simulationResult: null,
    pieceStyle: 'classic',
    unitMark: 'letters',
    getUnitPoint: (u) => POINTS[u.province],
    describePiece: () => ({
      flagDirection: 1,
      frame: getPieceFrame('classic'),
    }),
    touchHitRadius: () => 0,
    handleSelectUnitOnMap: vi.fn(),
    onHoverUnit: vi.fn(),
    ...ctx,
  };
  const { container } = render(
    <svg>
      <UnitsLayer units={units} ctx={full} />
    </svg>,
  );
  const token = (u: Unit) =>
    container.querySelector<SVGGElement>(
      `[data-unit-id="${u.id}"][data-testid="unit-token"]`,
    )!;
  return { container, token, ctx: full };
}

describe('UnitsLayer', () => {
  it('draws every unit where it stands, with what tests and the E2E runs read', () => {
    const { container, token } = draw([A_PAR, A_BUR_GER]);
    expect(
      container.querySelectorAll('[data-testid="unit-token"]'),
    ).toHaveLength(2);
    const par = token(A_PAR);
    expect(par).toHaveAttribute('transform', 'translate(560, 760)');
    expect(par.dataset).toMatchObject({
      unitPower: 'FRANCE',
      unitType: 'A',
      province: 'PAR',
      controllable: 'true',
    });
    expect(token(A_BUR_GER)).toHaveClass('foreign-locked');
    expect(token(A_BUR_GER).dataset.controllable).toBe('false');
  });

  it('lets the sandbox command a foreign unit', () => {
    const { token } = draw([A_BUR_GER], { canEditAnyPower: true });
    expect(token(A_BUR_GER).dataset.controllable).toBe('true');
    expect(token(A_BUR_GER)).not.toHaveClass('foreign-locked');
  });

  it('marks the selected unit, and a hovered one only if it is controllable', () => {
    const selected = draw([A_PAR], { selectedUnit: A_PAR });
    expect(selected.token(A_PAR)).toHaveClass('selected');
    const hoverOwn = draw([A_PAR], { hoveredUnitId: A_PAR.id });
    expect(hoverOwn.token(A_PAR)).toHaveClass('hovered');
    const hoverForeign = draw([A_BUR_GER], { hoveredUnitId: A_BUR_GER.id });
    expect(hoverForeign.token(A_BUR_GER)).not.toHaveClass('hovered');
  });

  it('selects on click and hovers with a mouse, never with a finger', () => {
    const { token, ctx } = draw([A_PAR]);
    fireEvent.click(token(A_PAR));
    expect(ctx.handleSelectUnitOnMap).toHaveBeenCalledWith(
      A_PAR,
      expect.anything(),
    );
    fireEvent.pointerEnter(token(A_PAR), { pointerType: 'touch' });
    expect(ctx.onHoverUnit).not.toHaveBeenCalled();
    fireEvent.pointerEnter(token(A_PAR), { pointerType: 'mouse' });
    fireEvent.pointerLeave(token(A_PAR), { pointerType: 'mouse' });
    expect(ctx.onHoverUnit).toHaveBeenNthCalledWith(1, A_PAR.id);
    expect(ctx.onHoverUnit).toHaveBeenNthCalledWith(2, null);
  });

  it('banners a dislodged unit, and a unit being disbanded instead', () => {
    const out = unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true });
    const dislodged = draw([out]);
    expect(dislodged.token(out)).toHaveTextContent('DISLODGED!');
    expect(
      dislodged.container.querySelector(
        '[data-testid="dislodged-unit-indicator"]',
      ),
    ).not.toBeNull();

    const orders: Record<string, Order> = {
      [out.id]: orderFor(out, 'DISBAND'),
    };
    const disbanding = draw([out], { orders });
    expect(disbanding.token(out)).toHaveTextContent('✕ DISBAND');
    expect(disbanding.token(out)).not.toHaveTextContent('DISLODGED!');
  });

  it('badges supports to hold, and the worst issue', () => {
    const issue = (severity: 'error' | 'warning') =>
      ({ severity }) as ValidationIssue;
    const { token } = draw([A_PAR, A_MAR], {
      supportCountByUnitId: { [A_PAR.id]: 2 },
      issuesByUnit: {
        [A_PAR.id]: [issue('warning')],
        [A_MAR.id]: [issue('warning'), issue('error')],
      },
    });
    expect(token(A_PAR)).toHaveTextContent('+2');
    const badge = (u: Unit) =>
      Array.from(token(u).querySelectorAll('circle')).find(
        (c) => c.getAttribute('r') === '10.5',
      );
    expect(badge(A_PAR)).toHaveAttribute('fill', '#f59e0b');
    expect(badge(A_MAR)).toHaveAttribute('fill', '#dc2626');
  });

  it("hides a foreign unit's issues and supports", () => {
    const { token } = draw([A_BUR_GER], {
      issuesByUnit: {
        [A_BUR_GER.id]: [{ severity: 'error' } as ValidationIssue],
      },
    });
    expect(token(A_BUR_GER)).not.toHaveTextContent('!');
  });

  it('fades a unit that a simulation moves away, unless it is selected', () => {
    const orders = { [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'BUR' }) };
    const sim = {
      resolutions: {
        [A_PAR.id]: { succeeded: true } as OrderResolution,
      },
    } as unknown as SimulationResult;
    expect(
      draw([A_PAR], { orders, simulationResult: sim }).token(A_PAR),
    ).toHaveAttribute('opacity', '1');
    const shown = draw([A_PAR], {
      orders,
      simulationResult: sim,
      showSimulationOverlay: true,
    });
    expect(shown.token(A_PAR)).toHaveAttribute('opacity', '0.62');
    const selected = draw([A_PAR], {
      orders,
      simulationResult: sim,
      showSimulationOverlay: true,
      selectedUnit: A_PAR,
    });
    expect(selected.token(A_PAR)).toHaveAttribute('opacity', '1');
  });
});
