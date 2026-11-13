// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { A_PAR, issue, progressFor } from '../../test/macroFixtures';
import { unitAt } from '../../test/mapFixtures';
import {
  HistoryLockBar,
  PhaseContext,
  PowerHeader,
  StatusBadge,
} from './PowerHeader';

describe('StatusBadge', () => {
  const badge = (over: Partial<Parameters<typeof StatusBadge>[0]> = {}) =>
    render(
      <StatusBadge
        isSurrendered={false}
        isFinalized={false}
        blockingIssues={[]}
        {...over}
      />,
    ).container;

  it('says Drafting when nothing is wrong', () => {
    expect(badge().textContent).toBe('Drafting');
  });

  it('counts blocking issues and pluralises', () => {
    expect(badge({ blockingIssues: [issue(A_PAR, 'error')] }).textContent).toBe(
      ' 1 Issue',
    );
    expect(
      badge({
        blockingIssues: [issue(A_PAR, 'error'), issue(A_PAR, 'warning')],
      }).textContent,
    ).toBe(' 2 Issues');
  });

  it('puts Finalized over the issue count, and Civil Disorder over both', () => {
    const issues = [issue(A_PAR, 'error')];
    expect(
      badge({ isFinalized: true, blockingIssues: issues }).textContent,
    ).toBe(' Finalized');
    expect(
      badge({ isSurrendered: true, isFinalized: true, blockingIssues: issues })
        .textContent,
    ).toBe(' Civil Disorder');
  });
});

describe('PhaseContext', () => {
  const ctx = (
    over: Parameters<typeof progressFor>[0],
    phase: 'A' | 'R' | 'M',
  ) =>
    render(
      <PhaseContext
        activePower="FRANCE"
        progress={progressFor(over)}
        isAdjustmentPhase={phase === 'A'}
        isRetreatPhase={phase === 'R'}
      />,
    ).container;

  it('shows nothing in a movement phase', () => {
    expect(ctx({}, 'M').textContent).toBe('');
  });

  it('tells a power with open homes how many builds it may make', () => {
    const c = ctx(
      {
        units: [A_PAR],
        builds: { FRANCE: { count: 2, homes: ['MAR', 'BRE'] } } as never,
      },
      'A',
    );
    expect(c.textContent).toContain(
      'Build up to 2 units in open home centers (0/2 assigned).',
    );
  });

  it('explains a surplus with no open home, and a power in equilibrium', () => {
    expect(
      ctx({ builds: { FRANCE: { count: 1, homes: [] } } as never }, 'A')
        .textContent,
    ).toContain('+1 surplus, but home centers are occupied.');
    expect(ctx({}, 'A').textContent).toContain(
      'Forces in equilibrium (3 units = 3 SCs).',
    );
  });

  it('asks a power over strength to disband', () => {
    expect(
      ctx({ builds: { FRANCE: { count: -1, homes: [] } } as never }, 'A')
        .textContent,
    ).toContain('Disband 1 unit (0/1 selected).');
    expect(
      ctx({ builds: { FRANCE: { count: -2, homes: [] } } as never }, 'A')
        .textContent,
    ).toContain('Disband 2 units (0/2 selected).');
  });

  it('counts dislodged units in a retreat phase', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    expect(ctx({ units: [A_PAR, dislodged] }, 'R').textContent).toContain(
      '1 dislodged unit must Retreat or Disband.',
    );
    expect(ctx({ units: [A_PAR] }, 'R').textContent).toContain(
      'No dislodged units. Awaiting other powers.',
    );
  });
});

describe('HistoryLockBar', () => {
  it('names the turn and leads back to live', () => {
    const onReturnToLive = vi.fn();
    render(
      <HistoryLockBar
        historyLabel="Fall 1901 Movement"
        onReturnToLive={onReturnToLive}
      />,
    );
    expect(screen.getByTestId('history-lock-bar')).toHaveTextContent(
      'Viewing Fall 1901 Movement',
    );
    fireEvent.click(screen.getByTestId('history-lock-live-btn'));
    expect(onReturnToLive).toHaveBeenCalledTimes(1);
  });
});

describe('PowerHeader', () => {
  const header = (
    over: Partial<Parameters<typeof PowerHeader>[0]> = {},
    progress = progressFor(),
  ) =>
    render(
      <PowerHeader
        variant="panel"
        activePower="FRANCE"
        progress={progress}
        isSurrendered={false}
        isFinalized={false}
        locked={false}
        {...over}
      />,
    ).container;

  it('panel: full power name, unit and center counts, and a collapse button', () => {
    const onToggleCollapse = vi.fn();
    const c = header({ onToggleCollapse });
    expect(
      c.querySelector('[data-testid="power-banner-title"]'),
    ).toHaveTextContent('French Republic');
    expect(
      c.querySelector('[data-testid="power-banner-sub"]'),
    ).toHaveTextContent('3 Units • 3 SCs');
    fireEvent.click(screen.getByTestId('macro-sidebar-collapse-btn'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('flags are drawn at the size of each layout', () => {
    const panel = header().querySelector('svg') as SVGElement;
    expect([panel.getAttribute('width'), panel.getAttribute('height')]).toEqual(
      ['22', '15'],
    );
    const sheet = header({ variant: 'sheet' }).querySelector(
      'svg',
    ) as SVGElement;
    expect([sheet.getAttribute('width'), sheet.getAttribute('height')]).toEqual(
      ['24', '16'],
    );
  });

  it('panel: the collapse button says what it does', () => {
    header({ onToggleCollapse: vi.fn() });
    expect(screen.getByTestId('macro-sidebar-collapse-btn')).toHaveAttribute(
      'title',
      'Collapse Tactical Orders',
    );
  });

  it('panel: leaves out the collapse button when nothing can collapse', () => {
    header();
    expect(screen.queryByTestId('macro-sidebar-collapse-btn')).toBeNull();
  });

  it('panel: adds the dislodged units to the count', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const c = header(
      {},
      progressFor({ units: [A_PAR, dislodged], isRetreatPhase: true }),
    );
    expect(
      c.querySelector('[data-testid="power-banner-sub"]'),
    ).toHaveTextContent('1 Units (+1 Dislodged) • 3 SCs');
  });

  it('sheet: short name, counts with the unconfirmed number, and the status', () => {
    const c = header({ variant: 'sheet' });
    expect(
      c.querySelector('[data-testid="power-name-text"]'),
    ).toHaveTextContent('France');
    expect(screen.getByTestId('macro-sheet-counts')).toHaveTextContent(
      '3 units · 3 SCs · 3 unconfirmed',
    );
    expect(c.querySelector('[data-testid="status-badge"]')).toHaveTextContent(
      'Drafting',
    );
  });

  it('sheet: drops the unconfirmed count once everything is confirmed', () => {
    const orders = Object.fromEntries(
      Object.entries(progressFor().unitsByProv).map(([, u]) => [
        u.id,
        { unit_id: u.id, is_explicit: true },
      ]),
    );
    header({ variant: 'sheet' }, progressFor({ orders: orders as never }));
    expect(screen.getByTestId('macro-sheet-counts')).toHaveTextContent(
      /^3 units · 3 SCs$/,
    );
  });

  it('sheet: goes inert when the sheet shows a past turn', () => {
    const c = header({ variant: 'sheet', locked: true });
    expect(
      c.querySelector('[data-testid="macro-sheet-status-row"]'),
    ).toHaveAttribute('inert');
    const live = header({ variant: 'sheet', locked: false });
    expect(
      live.querySelector('[data-testid="macro-sheet-status-row"]'),
    ).not.toHaveAttribute('inert');
  });
});
