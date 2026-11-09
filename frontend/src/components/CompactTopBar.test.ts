import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MultiplayerGameSummary } from '../types/diplomacy';
import { DEFAULT_DISPLAY_PREFS } from '../utils/displayPrefs';
import {
  CompactTopBar,
  type CompactTopBarProps,
  describeIssueCount,
} from './CompactTopBar';
import { SurrenderModal } from './SurrenderModal';

const noop = () => {};

function renderBar(overrides: Partial<CompactTopBarProps> = {}): string {
  const props: CompactTopBarProps = {
    viewMode: 'sandbox',
    turn: { season: 'Spring', year: 1901, phase: 'Movement' },
    winner: null,
    errorCount: 0,
    warningCount: 0,
    onOpenOrderCheck: noop,
    onBackToLobby: noop,
    wsConnected: true,
    syncDetail: 'Game proto_1901',
    matchLabel: null,
    onEnterSoloSandbox: noop,
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    displayPrefsSaveState: 'device',
    onChangeDisplayPrefs: noop,
    authUser: null,
    onSignIn: noop,
    onSignOut: noop,
    ...overrides,
  };
  return renderToString(React.createElement(CompactTopBar, props));
}

describe('describeIssueCount', () => {
  it('names errors and warnings with the right plurals', () => {
    expect(describeIssueCount(2, 1)).toBe('2 errors, 1 warning');
    expect(describeIssueCount(1, 0)).toBe('1 error');
    expect(describeIssueCount(0, 3)).toBe('3 warnings');
    expect(describeIssueCount(0, 0)).toBe('No problems with your orders');
  });
});

describe('CompactTopBar', () => {
  it('shows the brand and the menu in the lobby, with no turn or problem count', () => {
    const html = renderBar({ viewMode: 'lobby', turn: null });
    expect(html).toContain('Sloplomacy');
    expect(html).toContain('aria-label="Menu"');
    expect(html).not.toContain('Back to lobby');
    expect(html).not.toContain('compact-turn-text');
    expect(html).not.toContain('compact-issue-badge');
  });

  it('shows the way back, the turn and a tappable problem count in a game', () => {
    const html = renderBar({ errorCount: 1, warningCount: 2 });
    expect(html).toContain('aria-label="Back to lobby"');
    expect(html).toContain(
      'Spring<!-- --> <!-- -->1901<!-- --> · <!-- -->Movement',
    );
    expect(html).toMatch(/<button[^>]*class="compact-issue-badge has-errors"/);
    expect(html).toContain('1 error, 2 warnings. Open the order check.');
    expect(html).toContain('<span>3</span>');
  });

  it('uses the warning colour when there are only warnings', () => {
    expect(renderBar({ warningCount: 1 })).toContain(
      'compact-issue-badge has-warnings',
    );
  });

  it('shows a plain check, not a button, when the orders are clean', () => {
    const html = renderBar();
    expect(html).toContain('compact-issue-badge is-clean');
    expect(html).not.toMatch(/<button[^>]*compact-issue-badge/);
  });

  it('shows the winner instead of the problem count once the game is over', () => {
    const html = renderBar({ winner: 'FRANCE', errorCount: 2 });
    expect(html).toContain('France<!-- --> wins');
    expect(html).not.toContain('compact-issue-badge');
  });

  it('marks the menu button while live sync is reconnecting', () => {
    const html = renderBar({ wsConnected: false });
    expect(html).toContain('Menu (live sync is reconnecting)');
    expect(html).toContain('compact-menu-alert-dot');
    expect(renderBar()).not.toContain('compact-menu-alert-dot');
  });

  it('starts with the menu closed', () => {
    const html = renderBar();
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('compact-menu-panel');
  });
});

describe('SurrenderModal on a phone', () => {
  const game: MultiplayerGameSummary = {
    game_id: 'mp_1',
    name: 'Phone Test',
    status: 'active',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    created_by: 'host@example.test',
    created_at: '2026-11-07T00:00:00Z',
    participants: {},
    finalized_powers: [],
    is_sandbox: false,
  };

  const render = (summary: MultiplayerGameSummary) =>
    renderToString(
      React.createElement(SurrenderModal, {
        isOpen: true,
        onClose: noop,
        game: summary,
        power: 'FRANCE',
        onSurrender: async () => {},
        onLeave: async () => {},
      }),
    );

  it('spells out the difference between the two surrender buttons in an active match', () => {
    const html = render(game);
    expect(html).toContain('surrender-choice-note compact-only');
    expect(html).toContain('Spectate keeps you in the room as an observer');
  });

  it('has no such note before the match starts', () => {
    expect(render({ ...game, status: 'waiting' })).not.toContain(
      'surrender-choice-note',
    );
  });
});
