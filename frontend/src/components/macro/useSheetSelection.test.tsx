// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A_BRE, A_PAR, HOLD_ORDERS } from '../../test/macroFixtures';
import { orderFor } from '../../test/mapFixtures';
import type { Order, Power, Unit } from '../../types/diplomacy';
import type { SheetSnap } from '../../utils/sheetHelpers';
import { useSheetSelection } from './useSheetSelection';

interface ProbeProps {
  isSheet?: boolean;
  sheetSnap?: SheetSnap;
  selectedUnitId?: string | null;
  activePower?: Power;
  units?: Unit[];
  orders?: Record<string, Order>;
  onHighlightProvinces: (p: string[]) => void;
}

/** The sheet's DOM, as MacroSidebar renders it: a scroller around the body that holds the cards. */
function Probe({
  isSheet = true,
  sheetSnap = 'peek',
  selectedUnitId = null,
  activePower = 'FRANCE',
  units = [A_PAR, A_BRE],
  orders = HOLD_ORDERS,
  onHighlightProvinces,
}: ProbeProps) {
  const ref = useSheetSelection({
    isSheet,
    sheetSnap,
    selectedUnitId,
    activePower,
    units,
    orders,
    onHighlightProvinces,
  });
  return (
    <div className="bottom-sheet-body" data-testid="scroller">
      <div ref={ref}>
        <div data-unit-id={A_PAR.id} data-testid="card-par" />
        <div data-unit-id={A_BRE.id} data-testid="card-bre" />
        <div data-home-province="MAR" data-testid="card-mar" />
      </div>
    </div>
  );
}

const rects = (positions: Record<string, number>) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const el = this as HTMLElement;
      const top = el.classList.contains('bottom-sheet-body')
        ? 100
        : (positions[el.dataset.testid ?? ''] ?? 0);
      return {
        top,
        bottom: top + 50,
        left: 0,
        right: 0,
        width: 0,
        height: 50,
        x: 0,
        y: top,
        toJSON() {},
      };
    },
  );
};

describe('useSheetSelection', () => {
  let onHighlight: ReturnType<typeof vi.fn<(p: string[]) => void>>;
  beforeEach(() => {
    onHighlight = vi.fn<(p: string[]) => void>();
    rects({ 'card-par': 400, 'card-bre': 700, 'card-mar': 900 });
  });
  afterEach(() => vi.restoreAllMocks());

  describe('highlighting', () => {
    it("lights up the selected unit's province, target and supported unit", () => {
      const orders = {
        ...HOLD_ORDERS,
        [A_PAR.id]: orderFor(A_PAR, 'SUPPORT', {
          target: 'BUR',
          aux_unit_origin: 'BRE',
        }),
      };
      render(
        <Probe
          selectedUnitId={A_PAR.id}
          orders={orders}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(onHighlight).toHaveBeenLastCalledWith(['PAR', 'BUR', 'BRE']);
    });

    it('skips targets a hold does not have', () => {
      render(
        <Probe selectedUnitId={A_BRE.id} onHighlightProvinces={onHighlight} />,
      );
      expect(onHighlight).toHaveBeenLastCalledWith(['BRE']);
    });

    it('clears the highlight when nothing, or something that is not a unit, is selected', () => {
      const { rerender } = render(
        <Probe selectedUnitId={A_PAR.id} onHighlightProvinces={onHighlight} />,
      );
      rerender(
        <Probe selectedUnitId={null} onHighlightProvinces={onHighlight} />,
      );
      expect(onHighlight).toHaveBeenLastCalledWith([]);
      rerender(
        <Probe
          selectedUnitId="BUILD_FRANCE_MAR"
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(onHighlight).toHaveBeenLastCalledWith([]);
    });

    it('starts as soon as the layout becomes the sheet', () => {
      const { rerender } = render(
        <Probe
          isSheet={false}
          selectedUnitId={A_PAR.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(onHighlight).not.toHaveBeenCalled();
      rerender(
        <Probe selectedUnitId={A_PAR.id} onHighlightProvinces={onHighlight} />,
      );
      expect(onHighlight).toHaveBeenLastCalledWith(['PAR']);
    });

    it('does nothing outside the sheet', () => {
      render(
        <Probe
          isSheet={false}
          selectedUnitId={A_PAR.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(onHighlight).not.toHaveBeenCalled();
    });

    it('does not repeat itself when only an unrelated prop changes', () => {
      const { rerender } = render(
        <Probe selectedUnitId={A_PAR.id} onHighlightProvinces={onHighlight} />,
      );
      expect(onHighlight).toHaveBeenCalledTimes(1);
      rerender(
        <Probe
          selectedUnitId={A_PAR.id}
          orders={{ ...HOLD_ORDERS }}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(onHighlight).toHaveBeenCalledTimes(1);
    });
  });

  describe('scrolling the card to the top', () => {
    const scrollerOf = (c: HTMLElement) =>
      c.querySelector<HTMLElement>('[data-testid="scroller"]') as HTMLElement;

    it("scrolls a raised sheet by the card's distance from the top, less a margin", () => {
      const { container } = render(
        <Probe
          sheetSnap="half"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      // card at 700, scroller at 100: 600, less the 8px margin.
      expect(scrollerOf(container).scrollTop).toBe(0 + 600 - 8);
    });

    it('scrolls when the sheet is raised with a unit already selected', () => {
      const { container, rerender } = render(
        <Probe
          sheetSnap="peek"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(0);
      rerender(
        <Probe
          sheetSnap="half"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(600 - 8);
    });

    it('finds a build slot card by its home province', () => {
      const { container } = render(
        <Probe
          sheetSnap="full"
          selectedUnitId="BUILD_FRANCE_MAR"
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(900 - 100 - 8);
    });

    it('does not look for a build slot of another power', () => {
      const { container } = render(
        <Probe
          sheetSnap="full"
          activePower="ENGLAND"
          selectedUnitId="BUILD_FRANCE_MAR"
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(0);
    });

    it('stays put at the peek, with nothing selected, or outside the sheet', () => {
      const { container, rerender } = render(
        <Probe
          sheetSnap="peek"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(0);
      rerender(
        <Probe
          sheetSnap="half"
          selectedUnitId={null}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(0);
      rerender(
        <Probe
          isSheet={false}
          sheetSnap="half"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scrollerOf(container).scrollTop).toBe(0);
    });

    it("does not scroll again when the selected unit's order changes", () => {
      const { container, rerender } = render(
        <Probe
          sheetSnap="half"
          selectedUnitId={A_BRE.id}
          onHighlightProvinces={onHighlight}
        />,
      );
      const scroller = scrollerOf(container);
      scroller.scrollTop = 0;
      rerender(
        <Probe
          sheetSnap="half"
          selectedUnitId={A_BRE.id}
          orders={{ ...HOLD_ORDERS }}
          onHighlightProvinces={onHighlight}
        />,
      );
      expect(scroller.scrollTop).toBe(0);
    });
  });
});
