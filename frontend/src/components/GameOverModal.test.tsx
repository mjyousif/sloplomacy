// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  ProvinceInfo,
} from '../types/diplomacy';
import { GameOverModal } from './GameOverModal';

const PROVINCES = {
  PAR: { is_supply_center: true },
  BRE: { is_supply_center: true },
  MAR: { is_supply_center: true },
  LON: { is_supply_center: true },
} as unknown as Record<string, ProvinceInfo>;

const WON_STATE = {
  game_id: 'mp_1',
  season: 'Fall',
  year: 1908,
  phase: 'Retreats',
  scenario_id: 'standard_1901',
  active_power: 'FRANCE',
  units: [],
  orders: {},
  ownership: {
    PAR: 'FRANCE',
    BRE: 'FRANCE',
    MAR: 'FRANCE',
    LON: 'ENGLAND',
  },
  finalized_powers: [],
  issues: [],
  turn_history: [],
  winner: 'FRANCE',
} as unknown as GameState;

const SUMMARY: MultiplayerGameSummary = {
  game_id: 'mp_1',
  name: 'Great War',
  status: 'completed',
  winner: 'FRANCE',
  season: 'Fall',
  year: 1908,
  phase: 'Retreats',
  created_by: 'alice@example.com',
  created_at: '2026-11-01T00:00:00Z',
  finalized_powers: [],
  is_sandbox: false,
  participants: {
    FRANCE: {
      user_id: 'u1',
      email: 'alice@example.com',
      display_name: 'Alice',
      power: 'FRANCE',
      joined_at: '2026-11-01T00:00:00Z',
    },
    ENGLAND: {
      user_id: 'u2',
      email: 'bob@example.com',
      display_name: 'Bob',
      power: 'ENGLAND',
      joined_at: '2026-11-01T00:00:00Z',
    },
  },
};

describe('GameOverModal', () => {
  it('renders Chancellery victory copy for the winning participant', async () => {
    const user = userEvent.setup();
    const onInspectBoard = vi.fn();
    const onReturnToLobby = vi.fn();
    const alice: AuthUser = {
      id: 'u1',
      email: 'alice@example.com',
      displayName: 'Alice',
    };

    render(
      <GameOverModal
        isOpen
        gameState={WON_STATE}
        provinces={PROVINCES}
        summary={SUMMARY}
        authUser={alice}
        viewMode="multiplayer"
        onInspectBoard={onInspectBoard}
        onReturnToLobby={onReturnToLobby}
      />,
    );

    expect(screen.getByText('HEGEMONY ACHIEVED · FALL 1908')).toBeVisible();
    expect(screen.getByText('Continental Hegemony Secured')).toBeVisible();
    expect(screen.getByText(/3 supply centers/)).toBeVisible();

    await user.click(screen.getByTestId('game-over-inspect-btn'));
    expect(onInspectBoard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('game-over-lobby-btn'));
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
  });

  it('renders consolation copy for a non-winning participant', () => {
    const bob: AuthUser = {
      id: 'u2',
      email: 'bob@example.com',
      displayName: 'Bob',
    };

    render(
      <GameOverModal
        isOpen
        gameState={WON_STATE}
        provinces={PROVINCES}
        summary={SUMMARY}
        authUser={bob}
        viewMode="multiplayer"
        onInspectBoard={vi.fn()}
        onReturnToLobby={vi.fn()}
      />,
    );

    expect(screen.getByText('CAMPAIGN CONCLUDED · FALL 1908')).toBeVisible();
    expect(screen.getByText('The Chancellery Recognizes France')).toBeVisible();
    expect(screen.getByText(/Though/)).toBeVisible();
    expect(screen.getByText('Review Final Map & History')).toBeVisible();
  });

  it('renders spectator / sandbox copy when viewer is not a seated participant', () => {
    render(
      <GameOverModal
        isOpen
        gameState={WON_STATE}
        provinces={PROVINCES}
        summary={SUMMARY}
        authUser={null}
        viewMode="sandbox"
        onInspectBoard={vi.fn()}
        onReturnToLobby={vi.fn()}
      />,
    );

    expect(
      screen.getByText('France Claims Continental Hegemony'),
    ).toBeVisible();
    expect(screen.getByText('Inspect Final Board')).toBeVisible();
  });
});
