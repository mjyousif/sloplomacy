// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  ALL_UNITS,
  FRENCH_OWNERSHIP,
  HOLD_ORDERS,
  MACRO_PROVINCES,
  participantsFor,
} from '../../test/macroFixtures';
import { MacroSidebar, type MacroSidebarProps } from '../MacroSidebar';
import { SpectatorBar } from './SpectatorBar';

const controls = () => ({
  passcode: null,
  onClaimSeat: vi.fn(),
  onLeave: vi.fn(),
});

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
  isMultiplayer: true,
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

describe('SpectatorBar', () => {
  it('picks the power shown and claims its seat only while it is free', () => {
    const c = controls();
    const onSelectPower = vi.fn();
    const { rerender } = render(
      <SpectatorBar
        controls={c}
        activePower="FRANCE"
        participants={{}}
        gameOver={false}
        onSelectPower={onSelectPower}
      />,
    );
    expect(
      screen.getByRole('button', { name: "Show France's units" }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: "Show Germany's units" }),
    );
    expect(onSelectPower).toHaveBeenCalledWith('GERMANY');

    fireEvent.click(screen.getByTestId('spectator-claim'));
    expect(c.onClaimSeat).toHaveBeenCalledWith('FRANCE');
    fireEvent.click(screen.getByTestId('spectator-leave'));
    expect(c.onLeave).toHaveBeenCalled();

    rerender(
      <SpectatorBar
        controls={c}
        activePower="FRANCE"
        participants={participantsFor(['FRANCE'])}
        gameOver={false}
      />,
    );
    expect(screen.queryByTestId('spectator-claim')).toBeNull();
    rerender(
      <SpectatorBar
        controls={c}
        activePower="FRANCE"
        participants={{}}
        gameOver={true}
      />,
    );
    expect(screen.queryByTestId('spectator-claim')).toBeNull();
  });
});

describe('MacroSidebar while watching', () => {
  it('lists the units with nothing to order and no footer', () => {
    const onUpdateOrder = vi.fn();
    const { container } = render(
      <MacroSidebar {...props({ spectator: controls(), onUpdateOrder })} />,
    );
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside).toHaveAttribute('data-spectating', 'true');
    expect(screen.getByTestId('spectator-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('history-lock-bar')).toBeNull();
    expect(screen.queryByTestId('macro-footer-actions')).toBeNull();
    expect(screen.queryByRole('button', { name: /Clear All/i })).toBeNull();
    const list = screen.getByTestId('macro-units-scroll-area');
    expect(list).toHaveAttribute('inert');
    expect(list.querySelector(`[data-unit-id="${A_BRE.id}"]`)).not.toBeNull();
  });

  it('keeps the phone sheet without Finalize', () => {
    render(
      <MacroSidebar {...props({ spectator: controls(), variant: 'sheet' })} />,
    );
    expect(screen.getByTestId('macro-sheet-peek')).toHaveAttribute(
      'data-spectating',
      'true',
    );
    expect(screen.getByTestId('spectator-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-sheet-controls')).toBeNull();
  });
});
