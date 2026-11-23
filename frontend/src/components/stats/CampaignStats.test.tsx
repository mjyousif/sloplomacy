// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ALL_POWERS,
  type CampaignAward,
  type CampaignStatsResponse,
  type Power,
  type PowerStats,
} from '../../types/diplomacy';
import { CampaignAwardsRow } from './CampaignAwardsRow';
import { DiplomaticSupportMatrix } from './DiplomaticSupportMatrix';
import { StatsOverviewTable } from './StatsOverviewTable';
import { SupplyCenterTimelineChart } from './SupplyCenterTimelineChart';

function makePowerStats(
  power: Power,
  overrides: Partial<PowerStats> = {},
): PowerStats {
  return {
    power,
    player_name: null,
    is_eliminated: false,
    is_surrendered: false,
    current_scs: 3,
    peak_scs: 4,
    scs_captured: 1,
    scs_lost: 0,
    units_built: 1,
    armies_built: 1,
    fleets_built: 0,
    units_disbanded: 0,
    units_destroyed: 0,
    enemies_dislodged: 0,
    builds_waived: 0,
    foreign_supports_given: 0,
    foreign_supports_effective: 0,
    foreign_supports_received: 0,
    foreign_convoys: 0,
    convoys_executed: 0,
    supports_cut: 0,
    moves_succeeded: 2,
    moves_bounced: 1,
    move_success_rate: 66.7,
    self_bounces: 0,
    press_messages_sent: 0,
    ...overrides,
  };
}

function makeStats(): CampaignStatsResponse {
  const powers = {} as Record<Power, PowerStats>;
  const supportMatrix = {} as Record<Power, Record<Power, number>>;
  const attackMatrix = {} as Record<Power, Record<Power, number>>;

  for (const p of ALL_POWERS) {
    powers[p] = makePowerStats(p);
    supportMatrix[p] = Object.fromEntries(
      ALL_POWERS.map((q) => [q, 0]),
    ) as Record<Power, number>;
    attackMatrix[p] = Object.fromEntries(
      ALL_POWERS.map((q) => [q, 0]),
    ) as Record<Power, number>;
  }

  powers.FRANCE = makePowerStats('FRANCE', {
    player_name: 'Alice',
    current_scs: 18,
    peak_scs: 18,
    enemies_dislodged: 6,
    units_built: 4,
    armies_built: 3,
    fleets_built: 1,
    convoys_executed: 2,
  });
  powers.ENGLAND = makePowerStats('ENGLAND', {
    player_name: 'Bob',
    current_scs: 5,
    peak_scs: 7,
    foreign_supports_given: 4,
    foreign_supports_effective: 3,
    convoys_executed: 3,
    foreign_convoys: 2,
  });
  powers.GERMANY = makePowerStats('GERMANY', {
    current_scs: 0,
    peak_scs: 5,
    is_eliminated: true,
    units_destroyed: 4,
    units_disbanded: 2,
    foreign_supports_received: 4,
  });

  supportMatrix.ENGLAND.FRANCE = 4;
  attackMatrix.FRANCE.GERMANY = 5;

  const awards: CampaignAward[] = [
    {
      id: 'kingmaker',
      title: 'Kingmaker',
      subtitle: 'Most Foreign Supports Given',
      power: 'ENGLAND',
      value: '4 supports',
      count: 4,
    },
    {
      id: 'iron_chancellor',
      title: 'Iron Chancellor',
      subtitle: 'Most Enemy Units Dislodged',
      power: 'FRANCE',
      value: '6 dislodged',
      count: 6,
    },
    {
      id: 'silver_tongue',
      title: 'Silver Tongue',
      subtitle: 'Most Press Messages Sent',
      power: 'GERMANY',
      value: '14 messages',
      count: 14,
    },
  ];

  return {
    game_id: 'mp_stats_test',
    turns_resolved: 12,
    powers,
    sc_timeline: [
      {
        label: 'Spring 1901',
        season: 'Spring',
        year: 1901,
        counts: {
          FRANCE: 3,
          ENGLAND: 3,
          GERMANY: 3,
          ITALY: 3,
          AUSTRIA: 3,
          RUSSIA: 4,
          TURKEY: 3,
        },
      },
      {
        label: 'Fall 1906',
        season: 'Fall',
        year: 1906,
        counts: {
          FRANCE: 18,
          ENGLAND: 5,
          GERMANY: 0,
          ITALY: 3,
          AUSTRIA: 3,
          RUSSIA: 2,
          TURKEY: 3,
        },
      },
    ],
    support_matrix: supportMatrix,
    attack_matrix: attackMatrix,
    awards,
  };
}

describe('CampaignStats components', () => {
  it('renders CampaignAwardsRow cards with power flags and metrics', () => {
    const stats = makeStats();
    render(<CampaignAwardsRow awards={stats.awards} />);

    expect(screen.getByTestId('campaign-awards-row')).toBeVisible();
    expect(screen.getByTestId('campaign-award-kingmaker')).toHaveTextContent(
      'England',
    );
    expect(screen.getByTestId('campaign-award-kingmaker')).toHaveTextContent(
      '4 supports',
    );
    expect(
      screen.getByTestId('campaign-award-iron_chancellor'),
    ).toHaveTextContent('France');
  });

  it('sorts StatsOverviewTable rows when clicking column headers', async () => {
    const user = userEvent.setup();
    const stats = makeStats();
    render(<StatsOverviewTable powers={stats.powers} winner="FRANCE" />);

    const getRowPowers = () =>
      screen
        .getAllByTestId(/^stats-row-/)
        .map((row) => row.getAttribute('data-testid'));

    // Default sort is current_scs descending -> France (18) first, Germany (0) last.
    expect(getRowPowers()[0]).toBe('stats-row-france');
    expect(getRowPowers()[6]).toBe('stats-row-germany');
    expect(screen.getByTestId('stats-row-france')).toHaveTextContent('WON');
    expect(screen.getByTestId('stats-row-germany')).toHaveTextContent('ELIM');

    // Sort by foreign_supports_given descending -> England (4) first.
    await user.click(screen.getByTestId('sort-col-foreign_supports_given'));
    expect(getRowPowers()[0]).toBe('stats-row-england');

    // Toggle same column ascending -> England (4) moves to the bottom.
    await user.click(screen.getByTestId('sort-col-foreign_supports_given'));
    expect(getRowPowers()[6]).toBe('stats-row-england');
  });

  it('renders SupplyCenterTimelineChart polylines and allows isolating a power', async () => {
    const user = userEvent.setup();
    const stats = makeStats();
    render(
      <SupplyCenterTimelineChart
        timeline={stats.sc_timeline}
        winner="FRANCE"
      />,
    );

    const chart = screen.getByTestId('sc-timeline-chart');
    expect(chart).toBeVisible();
    expect(
      within(chart).getByText('Supply Center Trajectory (2 Checkpoints)'),
    ).toBeVisible();

    const franceSeries = screen.getByTestId('timeline-series-france');
    const englandSeries = screen.getByTestId('timeline-series-england');
    expect(franceSeries.querySelector('polyline')).not.toBeNull();
    expect(englandSeries).toHaveAttribute('opacity', '1');

    await user.click(screen.getByRole('button', { name: /France/i }));
    expect(franceSeries).toHaveAttribute('opacity', '1');
    expect(englandSeries).toHaveAttribute('opacity', '0.18');
  });

  it('toggles DiplomaticSupportMatrix between Support Ledger and Conflict Ledger', async () => {
    const user = userEvent.setup();
    const stats = makeStats();
    render(
      <DiplomaticSupportMatrix
        powers={stats.powers}
        supportMatrix={stats.support_matrix}
        attackMatrix={stats.attack_matrix}
      />,
    );

    expect(screen.getByTestId('matrix-cell-england-france')).toHaveTextContent(
      '4',
    );
    expect(screen.getByTestId('matrix-cell-france-germany')).toHaveTextContent(
      '0',
    );

    await user.click(screen.getByTestId('matrix-mode-attack'));
    expect(screen.getByTestId('matrix-cell-france-germany')).toHaveTextContent(
      '5',
    );
    expect(screen.getByTestId('matrix-cell-england-france')).toHaveTextContent(
      '0',
    );
  });
});
