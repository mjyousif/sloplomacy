// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
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

describe('MacroSidebar Turn and Clock Settings', () => {
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
          preview: null,
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
    ).toBeInTheDocument();

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
                preview: null,
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
          preview: null,
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
