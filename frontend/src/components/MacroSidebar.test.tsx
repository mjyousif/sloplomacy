// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { MacroSidebar, type MacroSidebarProps } from './MacroSidebar';

const fns = () => ({
  onSelectUnit: vi.fn(),
  onHoverUnit: vi.fn(),
  onHighlightProvinces: vi.fn(),
  onUpdateOrder: vi.fn(),
  onConfirmAllHolds: vi.fn(),
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
    expect(aside).toHaveClass('macro-sidebar-expanded');
    expect(Array.from(aside.children).map((c) => c.className)).toEqual([
      'active-power-banner',
      'macro-units-scroll-area',
      'sidebar-footer-actions',
      'sidebar-version-footer',
    ]);
    expect(
      aside.querySelector('.active-power-banner')?.getAttribute('style'),
    ).toContain('border-left');
    expect(screen.getAllByTestId('unit-macro-card')).toHaveLength(3);
    expect(screen.getByTestId('btn-finalize-orders')).toBeInTheDocument();
    expect(screen.getByTestId('btn-adjudicate-phase')).toBeInTheDocument();
  });

  it('wires Confirm All, Finalize and Resolve to their handlers', () => {
    const { props } = sidebar();
    fireEvent.click(screen.getByTestId('btn-confirm-all'));
    fireEvent.click(screen.getByTestId('btn-finalize-orders'));
    fireEvent.click(screen.getByTestId('btn-adjudicate-phase'));
    expect(props.onConfirmAllHolds).toHaveBeenCalledTimes(1);
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

  it('offers Surrender only in a multiplayer match that handles it', () => {
    const solo = sidebar({ onSurrenderClick: vi.fn() });
    expect(solo.container.querySelector('.surrender-btn-sidebar')).toBeNull();
    solo.unmount();
    const onSurrenderClick = vi.fn();
    const mp = sidebar({ isMultiplayer: true, onSurrenderClick });
    fireEvent.click(
      mp.container.querySelector('.surrender-btn-sidebar') as HTMLElement,
    );
    expect(onSurrenderClick).toHaveBeenCalledTimes(1);
    mp.unmount();
    const noHandler = sidebar({ isMultiplayer: true });
    expect(
      noHandler.container.querySelector('.surrender-btn-sidebar'),
    ).toBeNull();
  });

  it('in multiplayer shows the consensus card from the powers it waits on', () => {
    const { container } = sidebar({
      isMultiplayer: true,
      participants: participantsFor(['FRANCE', 'ENGLAND']),
      lobbyStatus: 'active',
      finalizedPowers: ['FRANCE'],
    });
    expect(container.querySelector('.consensus-title')).toHaveTextContent(
      'Resolution Progress: 1/2 Ready',
    );
    expect(container.querySelector('.mp-consensus-desc')).toHaveTextContent(
      'Waiting on: England',
    );
  });

  it('puts the phase context in the banner during winter and retreats', () => {
    const winter = sidebar({ season: 'Winter', phase: 'Adjustments' });
    expect(
      winter.container.querySelector(
        '.active-power-banner .macro-phase-context-box',
      ),
    ).toHaveClass('adjustment');
    winter.unmount();
    const retreat = sidebar({ phase: 'Retreats', season: 'Fall' });
    expect(
      retreat.container.querySelector(
        '.active-power-banner .macro-phase-context-box',
      ),
    ).toHaveClass('retreat');
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
    expect(off.container.querySelector('.unit-sim-result-strip')).toBeNull();
    off.unmount();
    expect(
      sidebar({ simulationResult, sandboxMode: true }).container.querySelector(
        '.unit-sim-result-strip',
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

describe('MacroSidebar sheet', () => {
  afterEach(() => vi.restoreAllMocks());

  const sheet = (over: Partial<MacroSidebarProps> = {}) =>
    sidebar({ variant: 'sheet', ...over });

  it('shows the power, Confirm All and the footer at the peek, the cards in the body', () => {
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
    ).toEqual([
      'btn-confirm-all',
      'btn-finalize-orders',
      'btn-adjudicate-phase',
    ]);
    const body = container.querySelector(
      '[data-testid="macro-sheet-body"]',
    ) as HTMLElement;
    expect(
      body.querySelectorAll('[data-testid="unit-macro-card"]'),
    ).toHaveLength(3);
    expect(body).toHaveTextContent('Tap a card or the map');
  });

  it('puts Surrender at the foot of the body', () => {
    const { container } = sheet({
      isMultiplayer: true,
      onSurrenderClick: vi.fn(),
    });
    expect(
      container.querySelector(
        '[data-testid="macro-sheet-body"] [data-testid="macro-sheet-surrender"] [data-testid="btn-surrender-sidebar"]',
      ),
    ).not.toBeNull();
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

  it('repurposes the right sidebar into Turn and Clock Settings when opened', () => {
    const onClose = vi.fn();
    sidebar({
      onToggleCollapse: vi.fn(),
      turnClockSettings: {
        isOpen: true,
        onClose,
        gameId: 'proto_1901',
        gameState: {
          game_id: 'proto_1901',
          scenario_id: 'standard_1901',
          season: 'Spring',
          year: 1901,
          phase: 'Movement',
          units: ALL_UNITS,
          orders: HOLD_ORDERS,
          ownership: FRENCH_OWNERSHIP,
          active_power: 'FRANCE',
          finalized_powers: [],
          surrendered_powers: [],
          issues: [],
          turn_history: [],
          last_resolution: null,
          winner: null,
        },
        user: null,
        onStateUpdated: vi.fn(),
        onToast: vi.fn(),
      },
    });
    expect(screen.getByTestId('admin-tools-modal')).toBeInTheDocument();
    expect(screen.getByText('Turn and Clock Settings')).toBeInTheDocument();
    expect(
      screen.queryByText('Spring 1901 — Movement'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Revert to Past Turn')).toBeInTheDocument();
    expect(
      screen.getByText('Revert the game to a previously played turn snapshot.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Adjust Game Clock & Season')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unlock All Orders' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hard Reset Scenario')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-admin-close')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Collapse Right Sidebar' }),
    ).toHaveClass('sidebar-collapse-toggle-btn');

    const yearInput = screen.getByTestId('input-admin-year');
    const yearUpBtn = screen.getByTestId('btn-admin-year-up');
    const yearDownBtn = screen.getByTestId('btn-admin-year-down');
    expect(yearInput).toHaveValue(1901);
    expect(yearDownBtn).toBeDisabled();
    fireEvent.click(yearUpBtn);
    expect(yearInput).toHaveValue(1902);
    expect(yearDownBtn).toBeEnabled();
    fireEvent.click(yearDownBtn);
    expect(yearInput).toHaveValue(1901);

    const seasonSelect = screen.getByTestId('select-admin-season');
    expect(seasonSelect).toHaveTextContent('Spring');
    fireEvent.click(seasonSelect);
    fireEvent.click(screen.getByTestId('select-admin-season-option-fall'));
    expect(seasonSelect).toHaveTextContent('Fall');

    const phaseSelect = screen.getByTestId('select-admin-phase');
    expect(phaseSelect).toHaveTextContent('Movement');
    fireEvent.click(phaseSelect);
    fireEvent.click(screen.getByTestId('select-admin-phase-option-retreats'));
    expect(phaseSelect).toHaveTextContent('Retreats');

    expect(
      screen.queryByTestId('admin-turn-clock-actions-row'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s+snapshot/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Use this if a player forgot to enter orders/),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('select-admin-rollback-snapshot')).toBeDisabled();
    const rollbackBtn = screen.getByTestId('btn-admin-rollback');
    expect(rollbackBtn).toHaveTextContent('Revert');
    expect(rollbackBtn).toHaveClass('admin-secondary-btn');
    expect(rollbackBtn).not.toHaveClass('admin-primary-btn');
    expect(rollbackBtn).toBeDisabled();
  });

  it('lists available snapshots newest-first and rolls back to the chosen snapshot', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) => {
        const target = String(url);
        if (target.includes('/api/admin/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                is_creator: true,
                can_rollback: true,
                history_count: 2,
                history_entries: [
                  { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
                  { index: 1, season: 'Fall', year: 1901, phase: 'Movement' },
                ],
                creator_email: 'commander@diplomacy.local',
                creator_id: 'guest',
              }),
              { status: 200 },
            ),
          );
        }
        if (target.includes('/api/admin/rollback')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                game_id: 'proto_1901',
                scenario_id: 'standard_1901',
                season: 'Spring',
                year: 1901,
                phase: 'Movement',
                units: ALL_UNITS,
                orders: HOLD_ORDERS,
                ownership: FRENCH_OWNERSHIP,
                active_power: 'FRANCE',
                finalized_powers: [],
                surrendered_powers: [],
                issues: [],
                turn_history: [],
                last_resolution: null,
                winner: null,
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${target}`));
      });

    const onStateUpdated = vi.fn();
    sidebar({
      onToggleCollapse: vi.fn(),
      turnClockSettings: {
        isOpen: true,
        onClose: vi.fn(),
        gameId: 'proto_1901',
        gameState: {
          game_id: 'proto_1901',
          scenario_id: 'standard_1901',
          season: 'Winter',
          year: 1901,
          phase: 'Adjustments',
          units: ALL_UNITS,
          orders: HOLD_ORDERS,
          ownership: FRENCH_OWNERSHIP,
          active_power: 'FRANCE',
          finalized_powers: [],
          surrendered_powers: [],
          issues: [],
          turn_history: [],
          last_resolution: null,
          winner: null,
        },
        user: null,
        onStateUpdated,
        onToast: vi.fn(),
      },
    });

    const snapshotSelect = screen.getByTestId('select-admin-rollback-snapshot');
    await waitFor(() => {
      expect(snapshotSelect).toBeEnabled();
      expect(snapshotSelect).toHaveTextContent('Fall 1901 Movement');
    });

    fireEvent.click(snapshotSelect);
    fireEvent.click(
      screen.getByTestId('select-admin-rollback-snapshot-option-0'),
    );
    expect(snapshotSelect).toHaveTextContent('Spring 1901 Movement');

    const rollbackBtn = screen.getByTestId('btn-admin-rollback');
    expect(rollbackBtn).toHaveTextContent('Revert');
    fireEvent.click(rollbackBtn, { shiftKey: true });

    await waitFor(() => {
      const rollbackCall = fetchMock.mock.calls.find(([reqUrl]) =>
        String(reqUrl).includes('/api/admin/rollback'),
      );
      expect(rollbackCall).toBeDefined();
      const body = JSON.parse(String(rollbackCall?.[1]?.body));
      expect(body.snapshot_index).toBe(0);
      expect(onStateUpdated).toHaveBeenCalled();
    });

    fetchMock.mockRestore();
  });
});

describe('MacroSidebar: auto-scroll and compact orders', () => {
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
