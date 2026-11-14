// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POWER_METADATA } from '../../types/diplomacy';
import type { ConsensusStatusInfo } from '../../utils/orderHelpers';
import { ClearAllButton, OrderFooter, SurrenderButton } from './OrderFooter';

const CONSENSUS: ConsensusStatusInfo = {
  isWaitingForPlayers: false,
  title: 'Resolution Progress: 1/2 Ready',
  description: 'Waiting on: England',
  buttonLabel: 'Force Adjudicate Phase (Host Override)',
  buttonTitle: 'Host Admin Override: Force advance',
  isSoloAdvanceReady: false,
};

const footer = (over: Partial<Parameters<typeof OrderFooter>[0]> = {}) => {
  const fns = {
    onFinalizeClick: vi.fn(),
    onUnfinalizeClick: vi.fn(),
    onAdjudicateTurn: vi.fn(),
  };
  const view = render(
    <OrderFooter
      powerMeta={POWER_METADATA.FRANCE}
      isFinalized={false}
      blockingIssueCount={0}
      unconfirmedCount={0}
      isMultiplayer={false}
      isGameCreator={false}
      gameOver={false}
      isAdjustmentPhase={false}
      isRetreatPhase={false}
      consensusInfo={CONSENSUS}
      {...fns}
      {...over}
    />,
  );
  return { ...view, ...fns };
};

describe('ClearAllButton', () => {
  it('clears all orders on click', () => {
    const onClearAllOrders = vi.fn();
    render(<ClearAllButton onClearAllOrders={onClearAllOrders} />);
    const btn = screen.getByTestId('btn-clear-all');
    expect(btn).toHaveTextContent('Clear All Orders');
    fireEvent.click(btn);
    expect(onClearAllOrders).toHaveBeenCalledTimes(1);
  });
});

describe('SurrenderButton', () => {
  it('surrenders on click', () => {
    const onSurrenderClick = vi.fn();
    render(<SurrenderButton onSurrenderClick={onSurrenderClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Surrender/ }));
    expect(onSurrenderClick).toHaveBeenCalledTimes(1);
  });
});

describe('OrderFooter', () => {
  it('is a fragment, so the sheet can style its buttons as direct children', () => {
    const { container } = footer();
    for (const child of Array.from(container.children)) {
      expect(child.tagName).toBe('BUTTON');
    }
  });

  it('finalizes, naming the unconfirmed orders', () => {
    const { onFinalizeClick } = footer({ unconfirmedCount: 2 });
    const btn = screen.getByTestId('btn-finalize-orders');
    expect(btn).toHaveTextContent('Finalize France Orders (2 Unconfirmed)');
    expect(btn).not.toHaveAttribute('data-warning');
    fireEvent.click(btn);
    expect(onFinalizeClick).toHaveBeenCalledTimes(1);
  });

  it('names no unconfirmed orders when everything is confirmed', () => {
    footer({ unconfirmedCount: 0 });
    expect(screen.getByTestId('btn-finalize-orders')).toHaveTextContent(
      /^Finalize France Orders$/,
    );
  });

  it('names the warnings instead when the orders have blocking issues', () => {
    footer({ blockingIssueCount: 1, unconfirmedCount: 3 });
    const btn = screen.getByTestId('btn-finalize-orders');
    expect(btn).toHaveTextContent('Finalize France (1 Warning)');
    expect(btn).toHaveAttribute('data-warning', 'true');
    footer({ blockingIssueCount: 2 });
    expect(screen.getAllByTestId('btn-finalize-orders')[1]).toHaveTextContent(
      'Finalize France (2 Warnings)',
    );
  });

  it('offers to unlock once finalized', () => {
    const { onUnfinalizeClick } = footer({ isFinalized: true });
    expect(screen.queryByTestId('btn-finalize-orders')).toBeNull();
    const btn = screen.getByTestId('btn-unfinalize-orders');
    expect(btn).toHaveTextContent('Orders Finalized — Click to Unlock');
    fireEvent.click(btn);
    expect(onUnfinalizeClick).toHaveBeenCalledTimes(1);
  });

  describe('solo', () => {
    it.each([
      [false, false, 'Resolve Phase'],
      [true, false, 'Resolve Adjustments & Advance'],
      [false, true, 'Resolve Retreats & Advance'],
    ])('adjudicate label: adjustments %s, retreats %s', (adj, ret, label) => {
      const { onAdjudicateTurn } = footer({
        isAdjustmentPhase: adj,
        isRetreatPhase: ret,
      });
      const btn = screen.getByTestId('btn-adjudicate-phase');
      expect(btn).toHaveTextContent(label);
      fireEvent.click(btn);
      expect(onAdjudicateTurn).toHaveBeenCalledTimes(1);
    });

    it('says Game Over and disables Resolve when the game is won', () => {
      footer({ gameOver: true });
      const btn = screen.getByTestId('btn-adjudicate-phase');
      expect(btn).toHaveTextContent('Game Over');
      expect(btn).toBeDisabled();
    });
  });

  describe('multiplayer', () => {
    it('shows the consensus card and no solo Resolve button', () => {
      footer({ isMultiplayer: true });
      expect(screen.queryByTestId('btn-adjudicate-phase')).toBeNull();
      expect(screen.getByTestId('consensus-title')).toHaveTextContent(
        CONSENSUS.title,
      );
      expect(screen.getByTestId('mp-consensus-desc')).toHaveTextContent(
        CONSENSUS.description,
      );
      expect(
        screen.getByTestId('mp-consensus-status-card'),
      ).not.toHaveAttribute('data-waiting');
    });

    it('marks the card as waiting when the match is waiting for players', () => {
      footer({
        isMultiplayer: true,
        consensusInfo: { ...CONSENSUS, isWaitingForPlayers: true },
      });
      expect(screen.getByTestId('mp-consensus-status-card')).toHaveAttribute(
        'data-waiting',
        'true',
      );
    });

    it('gives only the host the override, which carries the consensus label', () => {
      const guest = footer({ isMultiplayer: true });
      expect(
        guest.container.querySelector('[data-testid="btn-creator-override"]'),
      ).toBeNull();
      guest.unmount();

      const host = footer({
        isMultiplayer: true,
        isGameCreator: true,
        consensusInfo: { ...CONSENSUS, isSoloAdvanceReady: true },
      });
      const btn = screen.getByTestId('btn-creator-override');
      expect(btn).toHaveTextContent(CONSENSUS.buttonLabel);
      expect(btn).toHaveAttribute('title', CONSENSUS.buttonTitle);
      expect(btn).toHaveAttribute('data-solo-ready', 'true');
      fireEvent.click(btn);
      expect(host.onAdjudicateTurn).toHaveBeenCalledTimes(1);
    });

    it('disables the host override when the game is over', () => {
      footer({
        isMultiplayer: true,
        isGameCreator: true,
        gameOver: true,
      });
      expect(screen.getByTestId('btn-creator-override')).toBeDisabled();
    });
  });
});
