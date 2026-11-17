// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  FRENCH_OWNERSHIP,
  HOLD_ORDERS,
  issue,
  MACRO_PROVINCES,
  participantsFor,
} from '../test/macroFixtures';
import { orderFor, unitAt } from '../test/mapFixtures';
import type { TurnRecord } from '../types/diplomacy';
import { MacroSidebar, type MacroSidebarProps } from './MacroSidebar';

const fns = () => ({
  onSelectUnit: vi.fn(),
  onHoverUnit: vi.fn(),
  onHighlightProvinces: vi.fn(),
  onUpdateOrder: vi.fn(),
  onClearAllOrders: vi.fn(),
  onFinalizeClick: vi.fn(),
  onUnfinalizeClick: vi.fn(),
  onAdjudicateTurn: vi.fn(),
});

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
  ...fns(),
});

const sidebar = (over: Partial<MacroSidebarProps> = {}) => {
  const props = { ...baseProps(), ...over };
  const view = render(<MacroSidebar {...props} />);
  return { ...view, props };
};

/** A sidebar that collapses and expands itself, as the workspace's rail toggle does. */
function Toggle() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <MacroSidebar
      {...baseProps()}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
    />
  );
}

describe('MacroSidebar panel', () => {
  it('shows the power, its orders and the footer, in that order', () => {
    const { container } = sidebar();
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside).toHaveAttribute('data-expanded', 'true');
    expect(
      Array.from(aside.children).map((c) => c.getAttribute('data-testid')),
    ).toEqual([
      'active-power-banner',
      'macro-units-scroll-area',
      'macro-footer-actions',
    ]);
    expect(screen.queryByTitle(/Build revision:/)).toBeNull();
    expect(
      aside
        .querySelector('[data-testid="active-power-banner"]')
        ?.getAttribute('style'),
    ).toContain('border-left');
    expect(screen.getAllByTestId('unit-macro-card')).toHaveLength(3);
    expect(screen.getByTestId('btn-finalize-orders')).toBeInTheDocument();
    expect(screen.getByTestId('btn-adjudicate-phase')).toBeInTheDocument();
  });

  it('wires Clear All, Finalize and Resolve to their handlers', () => {
    const { props } = sidebar();
    fireEvent.click(screen.getByTestId('btn-clear-all'));
    fireEvent.click(screen.getByTestId('btn-clear-all-confirm'));
    fireEvent.click(screen.getByTestId('btn-finalize-orders'));
    fireEvent.click(screen.getByTestId('btn-adjudicate-phase'));
    expect(props.onClearAllOrders).toHaveBeenCalledTimes(1);
    expect(props.onFinalizeClick).toHaveBeenCalledTimes(1);
    expect(props.onAdjudicateTurn).toHaveBeenCalledTimes(1);
  });

  it('shows Unlock for a finalized power', () => {
    const { props } = sidebar({ finalizedPowers: ['FRANCE'] });
    fireEvent.click(screen.getByTestId('btn-unfinalize-orders'));
    expect(props.onUnfinalizeClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Finalized')).toBeInTheDocument();
  });

  it('counts the blocking issues in the status and on Finalize', () => {
    sidebar({ issues: [issue(A_PAR, 'error'), issue(A_BRE, 'info')] });
    expect(screen.getByText(/1 Issue/)).toBeInTheDocument();
    expect(screen.getByTestId('btn-finalize-orders')).toHaveTextContent(
      'Finalize France (1 Warning)',
    );
  });

  it('shows Civil Disorder for a surrendered power', () => {
    sidebar({ surrenderedPowers: ['FRANCE'] });
    expect(screen.getByText('Civil Disorder')).toBeInTheDocument();
  });

  it('does not render Surrender inside the right order sidebar', () => {
    const mp = sidebar({ isMultiplayer: true });
    expect(
      mp.container.querySelector('[data-testid="btn-surrender-sidebar"]'),
    ).toBeNull();
  });

  it('in multiplayer shows the consensus card from the powers it waits on', () => {
    const { container } = sidebar({
      isMultiplayer: true,
      participants: participantsFor(['FRANCE', 'ENGLAND']),
      lobbyStatus: 'active',
      finalizedPowers: ['FRANCE'],
    });
    expect(
      container.querySelector('[data-testid="consensus-title"]'),
    ).toHaveTextContent('Resolution Progress: 1/2 Ready');
    expect(
      container.querySelector('[data-testid="mp-consensus-desc"]'),
    ).toHaveTextContent('Waiting on: England');
  });

  it('puts the phase context in the banner during winter and retreats', () => {
    const winter = sidebar({ season: 'Winter', phase: 'Adjustments' });
    expect(
      winter.container.querySelector(
        '[data-testid="active-power-banner"] [data-testid="macro-phase-context-box"]',
      ),
    ).toHaveAttribute('data-phase', 'adjustment');
    winter.unmount();
    const retreat = sidebar({ phase: 'Retreats', season: 'Fall' });
    expect(
      retreat.container.querySelector(
        '[data-testid="active-power-banner"] [data-testid="macro-phase-context-box"]',
      ),
    ).toHaveAttribute('data-phase', 'retreat');
  });

  it("shows the unit cards' controls for a dislodged unit in a retreat phase", () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    sidebar({
      phase: 'Retreats',
      season: 'Fall',
      units: [A_PAR, dislodged],
      orders: {
        [dislodged.id]: orderFor(dislodged, 'RETREAT', { target: 'GAS' }),
      },
      retreats: { FRANCE: { 'A MAR': ['GAS'] } } as never,
    });
    expect(screen.getByTestId('select-retreat-target')).toBeInTheDocument();
  });

  it('shows the sandbox simulation strips only when simulating', () => {
    const simulationResult = {
      resolutions: { [A_PAR.id]: { succeeded: true, reason: 'Held.' } },
    } as never;
    const off = sidebar({ simulationResult });
    expect(
      off.container.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toBeNull();
    off.unmount();
    expect(
      sidebar({ simulationResult, sandboxMode: true }).container.querySelector(
        '[data-testid="unit-sim-result-strip"]',
      ),
    ).not.toBeNull();
  });

  it('does not highlight provinces by itself outside the phone sheet', () => {
    const { props } = sidebar({ selectedUnitId: A_PAR.id });
    expect(props.onHighlightProvinces).not.toHaveBeenCalled();
  });

  describe('the powers the match waits on', () => {
    const consensus = (c: HTMLElement) =>
      c.querySelector('[data-testid="consensus-title"]')?.textContent;

    it('follows the participants as they change', () => {
      // A stable list: an omitted prop is a new array on every render and would refresh the memo.
      const props = {
        ...baseProps(),
        isMultiplayer: true,
        lobbyStatus: 'active',
        surrenderedPowers: [] as never[],
      };
      const { container, rerender } = render(
        <MacroSidebar
          {...props}
          participants={participantsFor(['FRANCE', 'ENGLAND'])}
        />,
      );
      expect(consensus(container)).toBe('Resolution Progress: 0/2 Ready');
      rerender(
        <MacroSidebar
          {...props}
          participants={participantsFor(['FRANCE', 'ENGLAND', 'GERMANY'], {})}
        />,
      );
      // Germany has a seat but no units, so the match still waits on two.
      expect(consensus(container)).toBe('Resolution Progress: 0/2 Ready');
      rerender(
        <MacroSidebar
          {...props}
          participants={participantsFor(['FRANCE', 'ENGLAND'], {
            surrendered: true,
          })}
        />,
      );
      expect(consensus(container)).toBe('Waiting for Players');
    });

    it('follows the retreat options as they change', () => {
      const props = {
        ...baseProps(),
        isMultiplayer: true,
        lobbyStatus: 'active',
        phase: 'Retreats',
        season: 'Fall',
        participants: participantsFor(['FRANCE', 'ENGLAND']),
        surrenderedPowers: [] as never[],
      };
      const { container, rerender } = render(
        <MacroSidebar {...props} retreats={null} />,
      );
      expect(consensus(container)).toBe('Waiting for Players');
      rerender(
        <MacroSidebar
          {...props}
          retreats={{ ENGLAND: { 'A PIC': ['BUR'] } } as never}
        />,
      );
      expect(consensus(container)).toBe('Resolution Progress: 0/1 Ready');
    });
  });

  describe('a past turn', () => {
    it('adds a bar leading back to live and makes the orders inert', () => {
      const onReturnToLive = vi.fn();
      const { container } = sidebar({
        historyLabel: 'Fall 1901 Movement',
        onReturnToLive,
      });
      expect(container.querySelector('aside')).toHaveAttribute(
        'data-history-locked',
        'true',
      );
      expect(
        container.querySelector('[data-testid="active-power-banner"]'),
      ).toHaveAttribute('inert');
      expect(
        container.querySelector('[data-testid="macro-units-scroll-area"]'),
      ).toHaveAttribute('inert');
      expect(
        container.querySelector('[data-testid="macro-footer-actions"]'),
      ).toHaveAttribute('inert');
      fireEvent.click(screen.getByTestId('history-lock-live-btn'));
      expect(onReturnToLive).toHaveBeenCalledTimes(1);
    });

    it('leaves the live panel alone', () => {
      const { container } = sidebar();
      expect(container.querySelector('aside')).not.toHaveAttribute(
        'data-history-locked',
      );
      expect(container.querySelector('[inert]')).toBeNull();
      expect(screen.queryByTestId('history-lock-bar')).toBeNull();
    });

    it('replaces grayed-out live controls with the past turn log when historyTurn is provided', () => {
      const turn = {
        index: 0,
        season: 'Spring',
        year: 1901,
        phase: 'Movement',
        ownership: {},
        units: [A_PAR],
        orders: {
          [A_PAR.id]: {
            unit_id: A_PAR.id,
            power: 'FRANCE',
            unit_type: 'A',
            origin: 'PAR',
            order_type: 'HOLD',
            via_convoy: false,
            is_explicit: true,
          },
        },
        resolution: {
          summary: [],
          new_units: [],
          new_ownership: {},
          resolutions: {},
        },
      } as unknown as TurnRecord;
      const { container } = sidebar({
        historyTurn: turn,
        historyLabel: 'Spring 1901 Movement',
        historyPowers: ['FRANCE'],
      });
      expect(container.querySelector('aside')).toHaveAttribute(
        'data-history-view',
        'true',
      );
      expect(container.querySelector('aside')).not.toHaveAttribute(
        'data-history-locked',
      );
      expect(container.querySelector('[inert]')).toBeNull();
      expect(screen.getByTestId('history-orders-list')).toBeInTheDocument();
      expect(screen.queryByTestId('active-power-banner')).toBeNull();
      expect(screen.queryByTestId('btn-clear-all')).toBeNull();
      expect(screen.queryByTestId('macro-footer-actions')).toBeNull();
    });
  });

  describe('collapsing', () => {
    it('has a collapse button when it can collapse', () => {
      const onToggleCollapse = vi.fn();
      sidebar({ onToggleCollapse });
      fireEvent.click(screen.getByTestId('macro-sidebar-collapse-btn'));
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('shows the rail when collapsed', () => {
      const { container } = sidebar({
        collapsed: true,
        onToggleCollapse: vi.fn(),
      });
      const aside = container.querySelector('aside') as HTMLElement;
      expect(aside).toHaveAttribute('data-testid', 'macro-sidebar-collapsed');
      expect(
        screen.getByTestId('macro-sidebar-expand-btn'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('unit-macro-card')).toBeNull();
    });

    it('keeps one <aside> as it collapses and expands, so its width transition plays', () => {
      const { container } = render(<Toggle />);
      const aside = container.querySelector('aside');
      fireEvent.click(screen.getByTestId('macro-sidebar-collapse-btn'));
      expect(container.querySelector('aside')).toBe(aside);
      expect(aside).toHaveAttribute('data-testid', 'macro-sidebar-collapsed');
      fireEvent.click(screen.getByTestId('macro-sidebar-expand-btn'));
      expect(container.querySelector('aside')).toBe(aside);
      expect(aside).toHaveAttribute('data-testid', 'macro-sidebar');
    });
  });
});

describe('MacroSidebar: auto-scroll and compact orders', () => {
  afterEach(() => vi.restoreAllMocks());
  it('scrolls the desktop order list when a unit outside the viewport is selected', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement;
        if (el.dataset.testid === 'macro-units-scroll-area') {
          return {
            top: 100,
            bottom: 300,
            left: 0,
            right: 0,
            width: 0,
            height: 200,
            x: 0,
            y: 100,
            toJSON() {},
          };
        }
        if (el.dataset.unitId === A_BRE.id) {
          return {
            top: 420,
            bottom: 480,
            left: 0,
            right: 0,
            width: 0,
            height: 60,
            x: 0,
            y: 420,
            toJSON() {},
          };
        }
        return {
          top: 120,
          bottom: 180,
          left: 0,
          right: 0,
          width: 0,
          height: 60,
          x: 0,
          y: 120,
          toJSON() {},
        };
      },
    );
    const { container } = sidebar({ selectedUnitId: A_BRE.id });
    expect(
      (
        container.querySelector(
          '[data-testid="macro-units-scroll-area"]',
        ) as HTMLElement
      ).scrollTop,
    ).toBe(480 - 300 + 8);
  });

  it('toggles between detailed and compact one-line order rows', () => {
    window.localStorage.removeItem('sloplomacy_compact_orders');
    const onUpdateOrder = vi.fn();
    const { container } = sidebar({
      orders: {
        [A_PAR.id]: {
          unit_id: A_PAR.id,
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'MOVE',
          target: 'PIC',
          via_convoy: false,
          is_explicit: true,
        },
      },
      onUpdateOrder,
    });

    const toggle = screen.getByTestId('btn-toggle-compact-orders');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      container.querySelector('[data-testid="unit-compact-row"]'),
    ).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(
      container.querySelectorAll('[data-testid="unit-compact-row"]'),
    ).toHaveLength(3);
    expect(window.localStorage.getItem('sloplomacy_compact_orders')).toBe('1');

    const cards = container.querySelectorAll('[data-testid="unit-macro-card"]');
    const firstCard = cards[0] as HTMLElement;
    const secondCard = cards[1] as HTMLElement;
    expect(firstCard).toHaveAttribute('data-compact', 'true');
    expect(
      firstCard.querySelectorAll(
        '[data-testid="order-type-tabs"] button[data-compact="true"]',
      ),
    ).toHaveLength(4);
    expect(
      secondCard.querySelector('[data-testid="select-order-target"]'),
    ).toBeNull();

    const targetTrigger = firstCard.querySelector(
      '[data-testid="select-order-target"]',
    ) as HTMLButtonElement;
    fireEvent.click(targetTrigger);
    fireEvent.click(screen.getByRole('option', { name: 'Burgundy' }));
    expect(onUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_id: A_PAR.id,
        order_type: 'MOVE',
        target: 'BUR',
      }),
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      container.querySelector('[data-testid="unit-compact-row"]'),
    ).toBeNull();
    window.localStorage.removeItem('sloplomacy_compact_orders');
  });
});
