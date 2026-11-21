// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  CampaignStatsResponse,
  GameState,
  MultiplayerGameSummary,
  Power,
  PowerStats,
  ProvinceInfo,
} from '../../types/diplomacy';
import { ALL_POWERS } from '../../types/diplomacy';
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
      display_name: 'Alice',
      power: 'FRANCE',
      joined_at: '2026-11-01T00:00:00Z',
    },
    ENGLAND: {
      user_id: 'u2',
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

  it('switches between War Ledger tabs and renders campaign awards', async () => {
    const user = userEvent.setup();
    const powers = {} as Record<Power, PowerStats>;
    const emptyMatrix = {} as Record<Power, Record<Power, number>>;
    for (const p of ALL_POWERS) {
      powers[p] = {
        power: p,
        player_name: p === 'FRANCE' ? 'Alice' : null,
        is_eliminated: false,
        is_surrendered: false,
        current_scs: p === 'FRANCE' ? 18 : 2,
        peak_scs: p === 'FRANCE' ? 18 : 4,
        scs_captured: p === 'FRANCE' ? 15 : 0,
        scs_lost: 0,
        units_built: p === 'FRANCE' ? 6 : 1,
        armies_built: p === 'FRANCE' ? 4 : 1,
        fleets_built: p === 'FRANCE' ? 2 : 0,
        units_disbanded: 0,
        units_destroyed: 0,
        enemies_dislodged: p === 'FRANCE' ? 5 : 0,
        builds_waived: 0,
        foreign_supports_given: p === 'ENGLAND' ? 3 : 0,
        foreign_supports_effective: p === 'ENGLAND' ? 2 : 0,
        foreign_supports_received: p === 'FRANCE' ? 3 : 0,
        foreign_convoys: 0,
        convoys_executed: 0,
        supports_cut: 0,
        moves_succeeded: 10,
        moves_bounced: 2,
        move_success_rate: 83.3,
        self_bounces: 0,
      };
      emptyMatrix[p] = Object.fromEntries(
        ALL_POWERS.map((q) => [q, 0]),
      ) as Record<Power, number>;
    }
    emptyMatrix.ENGLAND.FRANCE = 3;

    const initialStats: CampaignStatsResponse = {
      game_id: 'mp_1',
      turns_resolved: 9,
      powers,
      sc_timeline: [
        {
          label: 'Spring 1901',
          season: 'Spring',
          year: 1901,
          counts: Object.fromEntries(ALL_POWERS.map((p) => [p, 3])) as Record<
            Power,
            number
          >,
        },
        {
          label: 'Fall 1908',
          season: 'Fall',
          year: 1908,
          counts: Object.fromEntries(
            ALL_POWERS.map((p) => [p, p === 'FRANCE' ? 18 : 2]),
          ) as Record<Power, number>,
        },
      ],
      support_matrix: emptyMatrix,
      attack_matrix: emptyMatrix,
      awards: [
        {
          id: 'kingmaker',
          title: 'Kingmaker',
          subtitle: 'Most Foreign Supports Given',
          power: 'ENGLAND',
          value: '3 supports',
          count: 3,
        },
      ],
    };

    render(
      <GameOverModal
        isOpen
        gameState={WON_STATE}
        provinces={PROVINCES}
        summary={SUMMARY}
        authUser={null}
        viewMode="multiplayer"
        onInspectBoard={vi.fn()}
        onReturnToLobby={vi.fn()}
        initialStats={initialStats}
      />,
    );

    expect(screen.getByTestId('campaign-award-kingmaker')).toBeVisible();
    expect(screen.getByText('9 resolved phases')).toBeVisible();
    expect(screen.getByTestId('stats-overview-table')).toBeVisible();

    await user.click(screen.getByTestId('game-over-tab-timeline'));
    expect(screen.getByTestId('sc-timeline-chart')).toBeVisible();

    await user.click(screen.getByTestId('game-over-tab-diplomacy'));
    expect(screen.getByTestId('diplomatic-support-matrix')).toBeVisible();
    expect(screen.getByTestId('matrix-cell-england-france')).toHaveTextContent(
      '3',
    );
  });
});
