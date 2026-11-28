// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestionStore } from '../lib/suggestionStore';
import {
  ALL_UNITS,
  FRENCH_OWNERSHIP,
  HOLD_ORDERS,
  MACRO_PROVINCES,
} from '../test/macroFixtures';
import { MacroSidebar, type MacroSidebarProps } from './MacroSidebar';

const props = (over: Partial<MacroSidebarProps> = {}): MacroSidebarProps => ({
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
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  onSelectUnit: vi.fn(),
  onHoverUnit: vi.fn(),
  onHighlightProvinces: vi.fn(),
  onUpdateOrder: vi.fn(),
  onClearAllOrders: vi.fn(),
  onFinalizeClick: vi.fn(),
  onUnfinalizeClick: vi.fn(),
  onAdjudicateTurn: vi.fn(),
  ...over,
});

const button = () => screen.queryByTestId('btn-openings');

afterEach(() => suggestionStore.reset());

describe('MacroSidebar openings', () => {
  it('offers openings on Spring 1901 Movement, in the panel and the phone sheet', () => {
    const { unmount } = render(<MacroSidebar {...props()} />);
    expect(button()).toBeInTheDocument();
    unmount();
    render(
      <MacroSidebar {...props({ variant: 'sheet', sheetSnap: 'full' })} />,
    );
    expect(button()).toBeInTheDocument();
  });

  it.each([
    ['a later turn', { season: 'Fall' }],
    ['a later year', { year: 1902 }],
    ['retreats', { phase: 'Retreats' }],
    ['a finished game', { gameOver: true }],
    ['a surrendered power', { surrenderedPowers: ['FRANCE' as const] }],
    ['a past turn on the board', { historyLabel: 'Spring 1901 Movement' }],
    [
      'a spectator',
      {
        spectator: { passcode: null, onClaimSeat: vi.fn(), onLeave: vi.fn() },
      },
    ],
  ] as [string, Partial<MacroSidebarProps>][])(
    'hides them on %s',
    (_, over) => {
      render(<MacroSidebar {...props(over)} />);
      expect(button()).not.toBeInTheDocument();
    },
  );

  it('swaps the unit cards for the list, and back', () => {
    render(<MacroSidebar {...props()} />);
    fireEvent.click(button() as HTMLElement);
    expect(screen.getByTestId('openings-list')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('openings-close'));
    expect(screen.queryByTestId('openings-list')).not.toBeInTheDocument();
  });

  it('closes the list and clears the preview when a host panel takes over', () => {
    const { rerender } = render(<MacroSidebar {...props()} />);
    fireEvent.click(button() as HTMLElement);
    suggestionStore.previewOpening({
      id: 'fra-maginot',
      name: 'Maginot Opening',
      power: 'FRANCE',
      turn: 'Spring 1901 Movement',
      orders: [],
    });
    rerender(
      <MacroSidebar
        // Direct-Edit on: the same gate as an open Turn & Clock Settings panel.
        {...props({ directEditActive: true })}
      />,
    );
    expect(suggestionStore.getState().opening).toBeNull();
    rerender(<MacroSidebar {...props()} />);
    expect(screen.queryByTestId('openings-list')).not.toBeInTheDocument();
  });
});
