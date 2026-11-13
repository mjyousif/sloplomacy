// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
import { ArrowMarkerDefs } from './ArrowMarkerDefs';
import { OrderArrowsLayer } from './OrderArrowsLayer';
import type { OrderLayerContext } from './orders/orderLayerContext';

const POINTS: Record<string, Point> = {
  PAR: { x: 560, y: 760 },
  BUR: { x: 640, y: 780 },
  PIC: { x: 560, y: 680 },
  GAS: { x: 480, y: 900 },
  MAR: { x: 620, y: 1000 },
  BRE: { x: 420, y: 720 },
  ENG: { x: 430, y: 600 },
};

const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_BUR = unitAt('FRANCE', 'A', 'BUR');
const A_BRE = unitAt('FRANCE', 'A', 'BRE');
const F_ENG = unitAt('FRANCE', 'F', 'ENG');

const resolution = (
  unit: Unit,
  r: Partial<OrderResolution>,
): OrderResolution => ({
  unit_id: unit.id,
  origin: unit.province,
  order_type: 'MOVE',
  succeeded: false,
  bounced: false,
  cut: false,
  dislodged: false,
  attack_strength: 1,
  defense_strength: 1,
  reason: '',
  ...r,
});

function draw(
  units: Unit[],
  orders: Record<string, Order>,
  ctx: Partial<OrderLayerContext> = {},
) {
  const full: OrderLayerContext = {
    orders,
    provinces: FRANCE_PROVINCES,
    isUnitOrderVisible: (u) => u.power === 'FRANCE',
    issuesByUnit: {},
    supportCountByUnitId: {},
    moveMidpointsByOrigin: {},
    getUnitPoint: (u) => POINTS[u.province],
    getProvincePoint: (p) => POINTS[p],
    describePiece: () => ({
      flagDirection: 1,
      frame: getPieceFrame('classic'),
    }),
    pieceStyle: 'classic',
    unitMark: 'letters',
    pieceRingScale: 1,
    arrowScale: 1,
    selectedUnitId: null,
    hoveredUnitId: null,
    showSimulationOverlay: false,
    sandboxMode: false,
    simulationResult: null,
    ...ctx,
  };
  const { container } = render(
    <svg>
      <OrderArrowsLayer units={units} ctx={full} />
    </svg>,
  );
  const arrows = Array.from(
    container.querySelectorAll<SVGGElement>('[data-testid="order-arrow"]'),
  );
  return {
    container,
    arrows: arrows.map((a) => [
      a.dataset.orderUnit,
      a.dataset.orderType,
      a.dataset.orderTarget,
    ]),
    arrow: (unit: Unit) =>
      container.querySelector<SVGGElement>(`[data-order-unit="${unit.id}"]`)!,
  };
}

const moveOf = (unit: Unit, target: string, extra: Partial<Order> = {}) =>
  orderFor(unit, 'MOVE', { target, ...extra });

describe('OrderArrowsLayer', () => {
  it('draws convoys under supports under moves, and nothing for holds', () => {
    const orders = {
      [A_PAR.id]: moveOf(A_PAR, 'PIC'),
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PIC',
      }),
      [F_ENG.id]: orderFor(F_ENG, 'CONVOY', {
        aux_unit_origin: 'BRE',
        target: 'PIC',
      }),
      [A_BRE.id]: orderFor(A_BRE, 'HOLD'),
    };
    const { arrows } = draw([A_PAR, A_BUR, A_BRE, F_ENG], orders);
    expect(arrows).toEqual([
      [F_ENG.id, 'CONVOY', 'PIC'],
      [A_BUR.id, 'SUPPORT', 'PIC'],
      [A_PAR.id, 'MOVE', 'PIC'],
    ]);
  });

  it('draws only the orders it may show', () => {
    const A_PIC_GER = unitAt('GERMANY', 'A', 'PIC');
    const { arrows } = draw([A_PAR, A_PIC_GER], {
      [A_PAR.id]: moveOf(A_PAR, 'BUR'),
      [A_PIC_GER.id]: moveOf(A_PIC_GER, 'BRE'),
    });
    expect(arrows).toEqual([[A_PAR.id, 'MOVE', 'BUR']]);
  });

  it("skips a dislodged unit's support and convoy, but draws its retreat", () => {
    const out = unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true });
    const outFleet = unitAt('FRANCE', 'F', 'ENG', { is_dislodged: true });
    const { arrows } = draw([out, outFleet], {
      [out.id]: orderFor(out, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PAR',
      }),
      [outFleet.id]: orderFor(outFleet, 'CONVOY', {
        aux_unit_origin: 'BRE',
        target: 'PIC',
      }),
    });
    expect(arrows).toEqual([]);
    const retreat = draw([out], {
      [out.id]: orderFor(out, 'RETREAT', { target: 'GAS' }),
    });
    expect(retreat.arrows).toEqual([[out.id, 'RETREAT', 'GAS']]);
  });

  it('draws a retreat orange and dashed, and a convoyed move dashed', () => {
    const out = unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true });
    const retreat = draw([out], {
      [out.id]: orderFor(out, 'RETREAT', { target: 'GAS' }),
    });
    const line = retreat.arrow(out).querySelectorAll('path')[1];
    expect(line).toHaveAttribute('stroke', '#ea580c');
    expect(line).toHaveAttribute('stroke-dasharray', '8 4');
    expect(line).toHaveAttribute('marker-end', 'url(#arrow-warning)');

    const convoyed = draw([A_BRE], {
      [A_BRE.id]: moveOf(A_BRE, 'PIC', { via_convoy: true }),
    });
    expect(convoyed.arrow(A_BRE).querySelectorAll('path')[1]).toHaveAttribute(
      'stroke-dasharray',
      '10 5',
    );
  });

  it('colours an arrow by its worst issue', () => {
    const problem = (severity: 'error' | 'warning') =>
      ({ severity }) as ValidationIssue;
    const orders = { [A_PAR.id]: moveOf(A_PAR, 'BUR') };
    const error = draw([A_PAR], orders, {
      issuesByUnit: { [A_PAR.id]: [problem('warning'), problem('error')] },
    });
    expect(error.arrow(A_PAR).querySelectorAll('path')[1]).toHaveAttribute(
      'marker-end',
      'url(#arrow-error)',
    );
    const warn = draw([A_PAR], orders, {
      issuesByUnit: { [A_PAR.id]: [problem('warning')] },
    });
    expect(warn.arrow(A_PAR).querySelectorAll('path')[1]).toHaveAttribute(
      'stroke',
      '#d97706',
    );
  });

  it('thickens a supported move and badges it +N', () => {
    const orders = { [A_PAR.id]: moveOf(A_PAR, 'BUR') };
    const plain = draw([A_PAR], orders);
    expect(plain.arrow(A_PAR).querySelectorAll('path')[1]).toHaveAttribute(
      'stroke-width',
      '4.5',
    );
    const supported = draw([A_PAR], orders, {
      supportCountByUnitId: { [A_PAR.id]: 2 },
      selectedUnitId: A_PAR.id,
    });
    const line = supported.arrow(A_PAR).querySelectorAll('path')[1];
    expect(Number(line.getAttribute('stroke-width'))).toBeCloseTo(
      4.5 + 2 * 1.8 + 1.2,
    );
    expect(supported.arrow(A_PAR)).toHaveTextContent('+2');
  });

  it('points a support at the middle of the move it supports, and rings a support to hold', () => {
    const mid = { x: 600, y: 700 };
    const toMove = draw(
      [A_PAR, A_BUR],
      {
        [A_PAR.id]: moveOf(A_PAR, 'PIC'),
        [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
          aux_unit_origin: 'PAR',
          target: 'PIC',
        }),
      },
      { moveMidpointsByOrigin: { PAR: mid } },
    );
    const tip = toMove.arrow(A_BUR).querySelector('circle')!;
    expect([tip.getAttribute('cx'), tip.getAttribute('cy')]).toEqual([
      '600',
      '700',
    ]);
    expect(tip).toHaveAttribute('r', '8');

    const toHold = draw([A_BUR], {
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PAR',
      }),
    });
    const ring = toHold.arrow(A_BUR).querySelector('circle')!;
    expect([ring.getAttribute('cx'), ring.getAttribute('cy')]).toEqual([
      '560',
      '760',
    ]);
    expect(ring).toHaveAttribute('r', '24');
    expect(ring).toHaveAttribute('fill', 'none');
  });

  it('draws a projected move arrow and +N badge when supporting a foreign unit move', () => {
    const F_PIC_GER = unitAt('GERMANY', 'F', 'PIC');
    const { arrow } = draw([F_PIC_GER, A_BUR, A_PAR], {
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PIC',
        target: 'BRE',
      }),
      [A_PAR.id]: orderFor(A_PAR, 'SUPPORT', {
        aux_unit_origin: 'PIC',
        target: 'BRE',
      }),
    });
    const first = arrow(A_BUR);
    const second = arrow(A_PAR);
    expect(
      first.querySelector('[data-testid="projected-support-move"]'),
    ).not.toBeNull();
    expect(first).toHaveTextContent('+2');
    // Only drawn once per (aux_unit_origin, target) pair
    expect(
      second.querySelector('[data-testid="projected-support-move"]'),
    ).toBeNull();
    expect(second).not.toHaveTextContent('+2');
  });

  it('shows a simulated outcome: a landing ghost, a bounce, and a cut support', () => {
    const orders = {
      [A_PAR.id]: moveOf(A_PAR, 'PIC'),
      [A_BRE.id]: moveOf(A_BRE, 'GAS'),
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PIC',
      }),
    };
    const sim = {
      resolutions: {
        [A_PAR.id]: resolution(A_PAR, { succeeded: true }),
        [A_BRE.id]: resolution(A_BRE, { bounced: true }),
        [A_BUR.id]: resolution(A_BUR, { order_type: 'SUPPORT', cut: true }),
      },
    } as unknown as SimulationResult;

    const hidden = draw([A_PAR, A_BRE, A_BUR], orders, {
      simulationResult: sim,
    });
    expect(hidden.container).not.toHaveTextContent('BOUNCED');

    const shown = draw([A_PAR, A_BRE, A_BUR], orders, {
      simulationResult: sim,
      showSimulationOverlay: true,
    });
    expect(shown.arrow(A_PAR).querySelectorAll('path')[1]).toHaveAttribute(
      'marker-end',
      'url(#arrow-sim-ok)',
    );
    expect(
      shown.arrow(A_PAR).querySelector('g[opacity="0.88"]'),
    ).not.toBeNull();
    expect(shown.arrow(A_BRE)).toHaveTextContent('✕ BOUNCED');
    expect(shown.arrow(A_BRE).querySelectorAll('path')[1]).toHaveAttribute(
      'stroke-dasharray',
      '7 5',
    );
    expect(shown.arrow(A_BUR).querySelector('text')).toHaveTextContent(/^CUT$/);
    expect(shown.arrow(A_BUR).querySelectorAll('line')[1]).toHaveAttribute(
      'stroke',
      '#e11d48',
    );
  });

  it('rings the fleet on a convoy and runs the chain army → fleet → shore', () => {
    const { arrow } = draw([F_ENG], {
      [F_ENG.id]: orderFor(F_ENG, 'CONVOY', {
        aux_unit_origin: 'BRE',
        target: 'PIC',
      }),
    });
    expect(arrow(F_ENG).querySelector('path')).toHaveAttribute(
      'd',
      'M 420,720 L 430,600 L 560,680',
    );
    expect(arrow(F_ENG).querySelector('circle')).toHaveAttribute('r', '26');
  });
});

describe('ArrowMarkerDefs', () => {
  it('defines the arrowheads the arrows point to', () => {
    const { container } = render(
      <svg>
        <defs>
          <ArrowMarkerDefs />
        </defs>
      </svg>,
    );
    expect(
      Array.from(container.querySelectorAll('marker')).map((m) => m.id),
    ).toEqual([
      'arrow-valid',
      'arrow-warning',
      'arrow-error',
      'arrow-sim-ok',
      'arrow-sim-bounce',
      'arrow-support',
    ]);
  });
});
