// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pressStore } from '../../lib/pressStore';
import { unitAt } from '../../test/mapFixtures';
import type {
  GameParticipant,
  Power,
  PressMessage,
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

beforeEach(() => {
  localStorage.clear();
  pressStore.reset();
});

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
    expect(card('ENGLAND')).toHaveAttribute('data-selected', 'true');
    expect(within(card('ENGLAND')).getByText('Active')).toBeInTheDocument();
    expect(card('FRANCE')).not.toHaveAttribute('data-selected', 'true');
  });

  it('swaps to the standard order and drops the ranks with the Default pill', async () => {
    render(<StandingsSection {...base()} />);
    const byScore = screen.getByTestId('standings-sort-score');
    const byDefault = screen.getByTestId('standings-sort-default');
    expect(byScore).toHaveAttribute('data-active', 'true');
    await userEvent.click(byDefault);
    expect(powersShown()[0]).toBe('FRANCE');
    expect(screen.queryAllByTestId('power-rank')).toHaveLength(0);
    expect(byDefault).toHaveAttribute('data-active', 'true');
    expect(byScore).not.toHaveAttribute('data-active', 'true');
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
    expect(card('GERMANY')).toHaveAttribute('data-clickable', 'true');
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
    expect(card('GERMANY')).not.toHaveAttribute('data-clickable', 'true');
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

  it('shows Civil Disorder over Finalized over issues, and nothing while drafting', () => {
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
    const germanyIssueBadge = within(card('GERMANY')).getByTitle('1 issues');
    expect(germanyIssueBadge).toHaveTextContent('1');
    expect(germanyIssueBadge.querySelector('svg')).toBeInTheDocument();
    // A power still drafting has no mark: the row's tooltip says so instead.
    expect(within(card('ITALY')).queryByText('Draft')).toBeNull();
    expect(card('ITALY').querySelector('[data-status]')).toBeNull();
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
    expect(card('ENGLAND').querySelector('[data-status]')).toBeNull();
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

describe('StandingsSection: press recipients', () => {
  const seat = (power: Power): GameParticipant => ({
    user_id: power,
    email: 'e',
    display_name: power,
    power,
    joined_at: '',
  });
  const match = (extra: Partial<StandingsSectionProps> = {}) =>
    base({
      isMultiplayer: true,
      pressPower: 'FRANCE',
      participants: {
        FRANCE: seat('FRANCE'),
        GERMANY: seat('GERMANY'),
        ENGLAND: seat('ENGLAND'),
      },
      ...extra,
    });
  const pick = (power: Power) => screen.getByTestId(`press-recipient-${power}`);
  const note = (
    seq: number,
    sender: Power,
    recipients: Power[],
  ): PressMessage => ({
    id: `m${seq}`,
    seq,
    sender,
    anonymous: false,
    recipients,
    body: 'x',
    sent_at: '',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
  });
  const openPress = () => act(() => pressStore.open('g1', 'FRANCE'));

  it('has no letter buttons where there is no press', () => {
    render(<StandingsSection {...base()} />);
    expect(screen.queryByTestId('press-recipient-GERMANY')).toBeNull();
    // Nor while the store holds another seat's press.
    render(<StandingsSection {...match({ pressPower: 'GERMANY' })} />);
    openPress();
    expect(screen.queryByTestId('press-recipient-FRANCE')).toBeNull();
  });

  it("puts a letter button on every other country's row, on the right", () => {
    render(<StandingsSection {...match()} />);
    openPress();
    expect(within(card('FRANCE')).queryByRole('button')).toBeNull();
    const button = pick('GERMANY');
    expect(card('GERMANY').lastElementChild).toContainElement(button);
    expect(card('GERMANY').lastElementChild?.lastElementChild).toBe(button);
    expect(button).toHaveAccessibleName('Send privately to Germany');
  });

  it('lights a country when clicked and adds it to the recipients', async () => {
    const onSelectPower = vi.fn();
    render(<StandingsSection {...match({ onSelectPower })} />);
    openPress();
    await userEvent.click(pick('GERMANY'));
    await userEvent.click(pick('ENGLAND'));
    expect(pressStore.getState().recipients).toEqual(['GERMANY', 'ENGLAND']);
    expect(pick('GERMANY')).toHaveAttribute('aria-pressed', 'true');
    expect(pick('GERMANY')).toHaveAttribute('data-active', 'true');

    await userEvent.click(pick('GERMANY'));
    expect(pressStore.getState().recipients).toEqual(['ENGLAND']);
    expect(pick('GERMANY')).toHaveAttribute('aria-pressed', 'false');
    expect(onSelectPower).not.toHaveBeenCalled();
  });

  it('cannot pick a country with no player', () => {
    render(<StandingsSection {...match()} />);
    openPress();
    expect(pick('ITALY')).toBeDisabled();
    expect(pick('ITALY')).toHaveAccessibleName(
      'Italy has no player to write to',
    );
    expect(pick('GERMANY')).toBeEnabled();
  });

  it("shows the unread count of the player's one-to-one thread with a country", () => {
    render(<StandingsSection {...match()} />);
    openPress();
    act(() =>
      pressStore.addMessages('g1', 'FRANCE', [
        note(1, 'GERMANY', ['FRANCE']),
        note(2, 'GERMANY', ['FRANCE']),
        // A group thread and the public box count for no single country.
        note(3, 'ENGLAND', ['FRANCE', 'GERMANY']),
        note(4, 'ENGLAND', []),
      ]),
    );
    expect(
      within(pick('GERMANY')).getByTestId('press-pick-unread'),
    ).toHaveTextContent('2');
    expect(
      within(pick('ENGLAND')).queryByTestId('press-pick-unread'),
    ).toBeNull();
    act(() => pressStore.markRead('FRANCE+GERMANY', 2));
    expect(
      within(pick('GERMANY')).queryByTestId('press-pick-unread'),
    ).toBeNull();
  });
});
