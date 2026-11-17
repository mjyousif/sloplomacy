// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  FRENCH_OWNERSHIP,
  HOLD_ORDERS,
  MACRO_PROVINCES,
} from '../../test/macroFixtures';
import { MacroSidebar, type MacroSidebarProps } from '../MacroSidebar';

const baseProps = (): MacroSidebarProps => ({
  provinces: MACRO_PROVINCES,
  units: ALL_UNITS,
  orders: HOLD_ORDERS,
  ownership: FRENCH_OWNERSHIP,
  activePower: 'FRANCE',
  finalizedPowers: [],
  sandboxMode: false,
  selectedUnitId: null,
  hoveredUnitId: null,
  issues: [],
  simulationResult: null,
  showSimulationOverlay: false,
  onSelectUnit: vi.fn(),
  onHoverUnit: vi.fn(),
  onHighlightProvinces: vi.fn(),
  onUpdateOrder: vi.fn(),
  onClearAllOrders: vi.fn(),
  onFinalizeClick: vi.fn(),
  onUnfinalizeClick: vi.fn(),
  onAdjudicateTurn: vi.fn(),
});

const sidebar = (over: Partial<MacroSidebarProps> = {}) => {
  const props = { ...baseProps(), ...over };
  const view = render(<MacroSidebar {...props} />);
  return { ...view, props };
};

describe('MacroSidebar Clear All confirmation', () => {
  it('asks first: the first click clears nothing and focuses Cancel', () => {
    const { props } = sidebar();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    expect(props.onClearAllOrders).not.toHaveBeenCalled();
    expect(screen.queryByTestId('btn-clear-all')).toBeNull();
    const group = screen.getByTestId('clear-all-confirm');
    expect(
      Array.from(
        group.querySelectorAll<HTMLElement>('button[data-testid]'),
      ).map((b) => b.dataset.testid),
    ).toEqual(['btn-clear-all-confirm', 'btn-clear-all-cancel']);
    expect(screen.getByTestId('btn-clear-all-cancel')).toHaveFocus();
  });

  it('Yes clears once and puts the button back', () => {
    const { props } = sidebar();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    fireEvent.click(screen.getByTestId('btn-clear-all-confirm'));
    expect(props.onClearAllOrders).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('clear-all-confirm')).toBeNull();
    expect(screen.getByTestId('btn-clear-all')).toHaveFocus();
  });

  it('Cancel and Escape put the button back without clearing', () => {
    const { props } = sidebar();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    fireEvent.click(screen.getByTestId('btn-clear-all-cancel'));
    expect(screen.getByTestId('btn-clear-all')).toHaveFocus();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    fireEvent.keyDown(screen.getByTestId('btn-clear-all-cancel'), {
      key: 'Escape',
    });
    expect(screen.getByTestId('btn-clear-all')).toBeInTheDocument();
    expect(screen.queryByTestId('clear-all-confirm')).toBeNull();
    expect(props.onClearAllOrders).not.toHaveBeenCalled();
  });

  it('does not carry an open question into the next phase', () => {
    const { props, rerender } = sidebar();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    rerender(<MacroSidebar {...props} phase="Retreats" />);
    expect(screen.getByTestId('btn-clear-all')).toBeInTheDocument();
    expect(screen.queryByTestId('clear-all-confirm')).toBeNull();
  });

  it("takes the button's place in the phone sheet", () => {
    const { container } = sidebar({ variant: 'sheet' });
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    const controls = container.querySelector(
      '[data-testid="macro-sheet-controls"]',
    ) as HTMLElement;
    expect(
      Array.from(controls.children).map((c) => c.getAttribute('data-testid')),
    ).toEqual([
      'clear-all-confirm',
      'btn-finalize-orders',
      'btn-adjudicate-phase',
    ]);
  });
});

describe('MacroSidebar sheet', () => {
  afterEach(() => vi.restoreAllMocks());

  const sheet = (over: Partial<MacroSidebarProps> = {}) =>
    sidebar({ variant: 'sheet', ...over });

  it('shows the power, Clear All and the footer at the peek, the cards in the body', () => {
    const { container } = sheet();
    const peek = container.querySelector(
      '[data-testid="macro-sheet-peek"]',
    ) as HTMLElement;
    expect(
      peek.querySelector('[data-testid="macro-sheet-status-row"]'),
    ).not.toBeNull();
    const controls = peek.querySelector(
      '[data-testid="macro-sheet-controls"]',
    ) as HTMLElement;
    expect(
      Array.from(controls.children).map((c) => c.getAttribute('data-testid')),
    ).toEqual(['btn-clear-all', 'btn-finalize-orders', 'btn-adjudicate-phase']);
    const body = container.querySelector(
      '[data-testid="macro-sheet-body"]',
    ) as HTMLElement;
    expect(
      body.querySelectorAll('[data-testid="unit-macro-card"]'),
    ).toHaveLength(3);
    expect(body).toHaveTextContent('Tap a card or the map');
    expect(
      container.querySelector('[data-testid="macro-sheet-surrender"]'),
    ).toBeNull();
  });

  it('shows the lock bar in the peek and goes inert for a past turn', () => {
    const { container } = sheet({ historyLabel: 'Fall 1901 Movement' });
    const peek = container.querySelector(
      '[data-testid="macro-sheet-peek"]',
    ) as HTMLElement;
    expect(peek).toHaveAttribute('data-history-locked', 'true');
    expect(peek.firstElementChild).toHaveAttribute(
      'data-testid',
      'history-lock-bar',
    );
    expect(
      peek.querySelector('[data-testid="macro-sheet-status-row"]'),
    ).toHaveAttribute('inert');
    expect(
      peek.querySelector('[data-testid="macro-sheet-controls"]'),
    ).toHaveAttribute('inert');
    expect(
      container.querySelector('[data-testid="macro-sheet-body"]'),
    ).toHaveAttribute('inert');
  });

  it("lights up the selected unit's provinces, as a finger has no hover", () => {
    const { props } = sheet({ selectedUnitId: A_PAR.id });
    expect(props.onHighlightProvinces).toHaveBeenLastCalledWith(['PAR']);
  });

  it("scrolls the selected unit's card up when the sheet is raised", () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement;
        const top =
          el.dataset.testid === 'bottom-sheet-body'
            ? 100
            : el.dataset.unitId === A_BRE.id
              ? 500
              : 0;
        return {
          top,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: top,
          toJSON() {},
        };
      },
    );
    const { container } = sheet({
      sheetSnap: 'half',
      selectedUnitId: A_BRE.id,
    });
    expect(
      (
        container.querySelector(
          '[data-testid="bottom-sheet-body"]',
        ) as HTMLElement
      ).scrollTop,
    ).toBe(500 - 100 - 8);
  });

  it('steps the sheet through its stops from the handle', () => {
    const onSheetSnapChange = vi.fn();
    sheet({ onSheetSnapChange });
    fireEvent.click(screen.getByTestId('bottom-sheet-handle'));
    expect(onSheetSnapChange).toHaveBeenCalledWith('half');
  });
});
