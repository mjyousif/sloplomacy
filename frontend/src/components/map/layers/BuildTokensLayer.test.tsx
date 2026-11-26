// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '../../../data/europeMapGeometry';
import { FRANCE_PROVINCES } from '../../../test/mapFixtures';
import type { Order, Power } from '../../../types/diplomacy';
import { buildOrder, waiveOrder } from '../../../utils/orderBuilders';
import { getPieceFrame } from '../../MapPiece';
import { BuildTokensLayer } from './BuildTokensLayer';

const POINTS: Record<string, Point> = {
  PAR: { x: 560, y: 760 },
  BRE: { x: 420, y: 720 },
  'BRE/NC': { x: 410, y: 700 },
};

function draw(
  buildHomes: Record<string, Power>,
  orders: Record<string, Order>,
  extra: {
    selectedUnitId?: string | null;
    hoveredUnitId?: string | null;
    dragMoved?: boolean;
  } = {},
) {
  const onSelectUnit = vi.fn();
  const onHoverUnit = vi.fn();
  const getProvincePoint = vi.fn((p: string, coast?: string | null) =>
    coast ? POINTS[`${p}/${coast}`] : POINTS[p],
  );
  const { container } = render(
    <svg>
      <BuildTokensLayer
        buildHomes={buildHomes}
        orders={orders}
        provinces={FRANCE_PROVINCES}
        selectedUnitId={extra.selectedUnitId ?? null}
        hoveredUnitId={extra.hoveredUnitId ?? null}
        pieceStyle="classic"
        unitMark="letters"
        getProvincePoint={getProvincePoint}
        describePiece={() => ({
          flagDirection: 1,
          frame: getPieceFrame('classic'),
        })}
        touchHitRadius={() => 0}
        dragMovedRef={{ current: extra.dragMoved ?? false }}
        onSelectUnit={onSelectUnit}
        onHoverUnit={onHoverUnit}
      />
    </svg>,
  );
  const token = (id: string) =>
    container.querySelector<SVGGElement>(`[data-build-id="${id}"]`)!;
  return { container, token, onSelectUnit, onHoverUnit };
}

describe('BuildTokensLayer', () => {
  it('draws a slot on each home, as the piece being built', () => {
    const { container, token } = draw(
      { PAR: 'FRANCE', BRE: 'FRANCE' },
      {
        BUILD_FRANCE_PAR: buildOrder(
          'BUILD_FRANCE_PAR',
          'FRANCE',
          'PAR',
          'A',
          null,
        ),
        BUILD_FRANCE_BRE: buildOrder(
          'BUILD_FRANCE_BRE',
          'FRANCE',
          'BRE',
          'F',
          'NC',
        ),
      },
    );
    expect(
      container.querySelectorAll('[data-testid="build-token"]'),
    ).toHaveLength(2);
    expect(token('BUILD_FRANCE_PAR')).toHaveTextContent('BUILD A');
    expect(token('BUILD_FRANCE_PAR').dataset).toMatchObject({
      homeProvince: 'PAR',
      power: 'FRANCE',
    });
    // A fleet on a named coast stands on that coast's point.
    expect(token('BUILD_FRANCE_BRE')).toHaveTextContent('BUILD F/NC');
    expect(token('BUILD_FRANCE_BRE')).toHaveAttribute(
      'transform',
      'translate(410, 700)',
    );
  });

  it('shows a waived slot as a place to build, with no piece', () => {
    const { token } = draw(
      { PAR: 'FRANCE' },
      { BUILD_FRANCE_PAR: waiveOrder('BUILD_FRANCE_PAR', 'FRANCE', 'PAR') },
    );
    expect(token('BUILD_FRANCE_PAR')).toHaveTextContent('+ BUILD HERE');
    expect(token('BUILD_FRANCE_PAR')).not.toHaveTextContent('BUILD A');
  });

  it('selects a slot on click, and lets go of a selected one', () => {
    const first = draw({ PAR: 'FRANCE' }, {});
    fireEvent.click(first.token('BUILD_FRANCE_PAR'));
    expect(first.onSelectUnit).toHaveBeenCalledWith('BUILD_FRANCE_PAR');

    const again = draw(
      { PAR: 'FRANCE' },
      {},
      { selectedUnitId: 'BUILD_FRANCE_PAR' },
    );
    fireEvent.click(again.token('BUILD_FRANCE_PAR'));
    expect(again.onSelectUnit).toHaveBeenCalledWith(null);
  });

  it('ignores the click that ends a drag, and hovers only with a mouse', () => {
    const { token, onSelectUnit, onHoverUnit } = draw(
      { PAR: 'FRANCE' },
      {},
      { dragMoved: true },
    );
    fireEvent.click(token('BUILD_FRANCE_PAR'));
    expect(onSelectUnit).not.toHaveBeenCalled();
    fireEvent.pointerEnter(token('BUILD_FRANCE_PAR'), { pointerType: 'touch' });
    expect(onHoverUnit).not.toHaveBeenCalled();
    fireEvent.pointerEnter(token('BUILD_FRANCE_PAR'), { pointerType: 'mouse' });
    expect(onHoverUnit).toHaveBeenCalledWith('BUILD_FRANCE_PAR');
  });

  it('lifts a chosen build when selected or hovered, and keeps a ring for a waived slot', () => {
    const build = {
      BUILD_FRANCE_PAR: buildOrder(
        'BUILD_FRANCE_PAR',
        'FRANCE',
        'PAR',
        'A',
        null,
      ),
    };
    const lift = (g: SVGGElement) =>
      g.querySelector<SVGGElement>('[data-lift]')?.dataset.lift ?? null;
    const selected = draw({ PAR: 'FRANCE' }, build, {
      selectedUnitId: 'BUILD_FRANCE_PAR',
    });
    expect(lift(selected.token('BUILD_FRANCE_PAR'))).toBe('selected');
    // The lifted piece replaces the green selection ring.
    expect(
      selected.token('BUILD_FRANCE_PAR').querySelector('[stroke="#22c55e"]'),
    ).toBeNull();
    const hovered = draw({ PAR: 'FRANCE' }, build, {
      hoveredUnitId: 'BUILD_FRANCE_PAR',
    });
    expect(lift(hovered.token('BUILD_FRANCE_PAR'))).toBe('hovered');

    // A waived slot has no piece to lift, so selecting it still rings it.
    const waived = draw(
      { PAR: 'FRANCE' },
      { BUILD_FRANCE_PAR: waiveOrder('BUILD_FRANCE_PAR', 'FRANCE', 'PAR') },
      { selectedUnitId: 'BUILD_FRANCE_PAR' },
    );
    expect(lift(waived.token('BUILD_FRANCE_PAR'))).toBeNull();
    expect(
      waived.token('BUILD_FRANCE_PAR').querySelector('[stroke="#22c55e"]'),
    ).not.toBeNull();
  });
});
