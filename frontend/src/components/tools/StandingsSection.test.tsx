// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unitAt } from '../../test/mapFixtures';
import type {
  GameParticipant,
  Power,
  ValidationIssue,
} from '../../types/diplomacy';
import {
  StandingsSection,
  type StandingsSectionProps,
} from './StandingsSection';

const issue = (
  power: Power,
  severity: ValidationIssue['severity'],
  id = `${power}-${severity}`,
): ValidationIssue => ({
  id,
  severity,
  code: 'HOLD_ORDER_WITH_SUPPORT' as ValidationIssue['code'],
  title: 'Title',
  message: 'Message',
  unit_ids: [],
  provinces: [],
  power,
});

const base = (
  extra: Partial<StandingsSectionProps> = {},
): StandingsSectionProps => ({
  activePower: 'FRANCE',
  onSelectPower: vi.fn(),
  ownership: {
    BER: 'GERMANY',
    MUN: 'GERMANY',
    KIE: 'GERMANY',
    PAR: 'FRANCE',
    LON: 'ENGLAND',
  },
  units: [
    unitAt('FRANCE', 'A', 'PAR'),
    unitAt('ENGLAND', 'F', 'LON'),
    unitAt('GERMANY', 'A', 'BER'),
    unitAt('GERMANY', 'A', 'MUN'),
  ],
  finalizedPowers: [],
  issues: [],
  sandboxMode: false,
  ...extra,
});

const cards = () => screen.getAllByTestId('power-standing-card');
const powersShown = () => cards().map((c) => c.getAttribute('data-power'));
const card = (power: Power) =>
  cards().find((c) => c.getAttribute('data-power') === power) as HTMLElement;

beforeEach(() => localStorage.clear());

describe('StandingsSection: list', () => {
  it('ranks the seven powers by score and shows their counts', () => {
    render(<StandingsSection {...base()} />);
    expect(powersShown().slice(0, 3)).toEqual(['GERMANY', 'FRANCE', 'ENGLAND']);
    expect(cards()).toHaveLength(7);
    expect(within(card('GERMANY')).getByTestId('power-rank')).toHaveTextContent(
      '1',
    );
    expect(within(card('GERMANY')).getByText('3 SC')).toBeInTheDocument();
    expect(within(card('GERMANY')).getByText('2 Units')).toBeInTheDocument();
    expect(within(card('ENGLAND')).getByText('1 SC')).toBeInTheDocument();
  });

  it('marks the active power', () => {
    render(<StandingsSection {...base({ activePower: 'ENGLAND' })} />);
    expect(card('ENGLAND')).toHaveClass('selected');
    expect(within(card('ENGLAND')).getByText('Active')).toBeInTheDocument();
    expect(card('FRANCE')).not.toHaveClass('selected');
  });

  it('swaps to the standard order and drops the ranks with the Default pill', async () => {
    render(<StandingsSection {...base()} />);
    const byScore = screen.getByTestId('standings-sort-score');
    const byDefault = screen.getByTestId('standings-sort-default');
    expect(byScore).toHaveClass('active');
    await userEvent.click(byDefault);
    expect(powersShown()[0]).toBe('FRANCE');
    expect(screen.queryAllByTestId('power-rank')).toHaveLength(0);
    expect(byDefault).toHaveClass('active');
    expect(byScore).not.toHaveClass('active');
    await userEvent.click(byScore);
    expect(powersShown()[0]).toBe('GERMANY');
    expect(screen.getAllByTestId('power-rank')).toHaveLength(7);
  });

  it('starts from the remembered sort', () => {
    localStorage.setItem('sloplomacy_standings_sort', 'default');
    render(<StandingsSection {...base()} />);
    expect(powersShown()[0]).toBe('FRANCE');
  });
});

describe('StandingsSection: choosing a power', () => {
  it('lets a solo player pick any power', async () => {
    const onSelectPower = vi.fn();
    render(<StandingsSection {...base({ onSelectPower })} />);
    expect(screen.getByText('COMMAND NATION (SELECT)')).toBeInTheDocument();
    expect(card('GERMANY')).toHaveClass('clickable');
    expect(card('GERMANY')).toHaveAttribute(
      'title',
      'Click to command German Empire',
    );
    await userEvent.click(card('GERMANY'));
    expect(onSelectPower).toHaveBeenCalledExactlyOnceWith('GERMANY');
  });

  it('does not let anyone pick in a multiplayer match', async () => {
    const onSelectPower = vi.fn();
    render(
      <StandingsSection {...base({ onSelectPower, isMultiplayer: true })} />,
    );
    expect(screen.getByText('DIPLOMATIC STANDING')).toBeInTheDocument();
    expect(card('GERMANY')).not.toHaveClass('clickable');
    await userEvent.click(card('GERMANY'));
    expect(onSelectPower).not.toHaveBeenCalled();
  });
});

describe('StandingsSection: players and status', () => {
  const participant = (power: Power, name: string): GameParticipant => ({
    user_id: 'u',
    email: 'e',
    display_name: name,
    power,
    joined_at: '',
  });

  it('shows the occupant, or Open for an empty seat, in a multiplayer match', () => {
    render(
      <StandingsSection
        {...base({
          isMultiplayer: true,
          participants: { FRANCE: participant('FRANCE', 'Bob') },
          finalizedPowers: ['FRANCE'],
        })}
      />,
    );
    expect(within(card('FRANCE')).getByText('(Bob)')).toBeInTheDocument();
    expect(card('FRANCE')).toHaveAttribute(
      'title',
      'French Republic (Bob): Orders Finalized',
    );
    expect(within(card('ENGLAND')).getByText('(Open)')).toBeInTheDocument();
    expect(card('ENGLAND')).toHaveAttribute(
      'title',
      'United Kingdom (Open): Drafting',
    );
  });

  it('shows no player name in a solo game', () => {
    render(<StandingsSection {...base()} />);
    expect(screen.queryByText(/\(Open\)/)).toBeNull();
  });

  it('shows Civil Disorder over Finalized over issues over Draft', () => {
    render(
      <StandingsSection
        {...base({
          finalizedPowers: ['FRANCE', 'ENGLAND'],
          surrenderedPowers: ['FRANCE'],
          activePower: 'GERMANY',
          issues: [issue('GERMANY', 'error')],
        })}
      />,
    );
    expect(
      within(card('FRANCE')).getByTitle('Civil Disorder'),
    ).toHaveTextContent('CD');
    expect(within(card('ENGLAND')).getByTitle('Finalized')).toBeInTheDocument();
    expect(within(card('GERMANY')).getByTitle('1 issues')).toHaveTextContent(
      '1⚠',
    );
    expect(
      within(card('ITALY')).getByTitle('Drafting Orders'),
    ).toHaveTextContent('Draft');
  });

  it('counts errors and warnings but not info notes', () => {
    render(
      <StandingsSection
        {...base({
          issues: [
            issue('FRANCE', 'error', 'a'),
            issue('FRANCE', 'warning', 'b'),
            issue('FRANCE', 'info', 'c'),
          ],
        })}
      />,
    );
    expect(within(card('FRANCE')).getByTitle('2 issues')).toBeInTheDocument();
  });

  it("hides another power's issues unless sandbox or admin override is on", () => {
    const issues = [issue('ENGLAND', 'error')];
    const { rerender } = render(<StandingsSection {...base({ issues })} />);
    expect(
      within(card('ENGLAND')).getByTitle('Drafting Orders'),
    ).toBeInTheDocument();
    rerender(<StandingsSection {...base({ issues, sandboxMode: true })} />);
    expect(within(card('ENGLAND')).getByTitle('1 issues')).toBeInTheDocument();
    rerender(
      <StandingsSection {...base({ issues, adminOverrideActive: true })} />,
    );
    expect(within(card('ENGLAND')).getByTitle('1 issues')).toBeInTheDocument();
    rerender(
      <StandingsSection {...base({ issues, activePower: 'ENGLAND' })} />,
    );
    expect(within(card('ENGLAND')).getByTitle('1 issues')).toBeInTheDocument();
  });
});
