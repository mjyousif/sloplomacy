// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../../types/diplomacy';
import { DEFAULT_DISPLAY_PREFS } from '../../utils/displayPrefs';
import { SurrenderModal } from '../game/SurrenderModal';
import { CompactTopBar, type CompactTopBarProps } from './CompactTopBar';

const noop = () => {};

const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.test',
  displayName: 'Alice',
};

const MATCH: MultiplayerGameSummary = {
  game_id: 'mp_1',
  name: 'Phone Test',
  status: 'active',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  created_by: 'alice@example.test',
  created_at: '2026-11-07T00:00:00Z',
  participants: {},
  finalized_powers: [],
  is_sandbox: false,
};

function makeProps(
  overrides: Partial<CompactTopBarProps> = {},
): CompactTopBarProps {
  return {
    viewMode: 'sandbox',
    turn: { season: 'Spring', year: 1901, phase: 'Movement' },
    winner: null,
    onBackToLobby: vi.fn(),
    onEnterSoloSandbox: vi.fn(),
    matchSummary: null,
    playerPower: 'FRANCE',
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    displayPrefsSaveState: 'device',
    onChangeDisplayPrefs: vi.fn(),
    authUser: null,
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
}

describe('CompactTopBar', () => {
  it('shows the brand and AccountDropdownMenu in the lobby, without game navigation or GameSettingsMenu', () => {
    render(<CompactTopBar {...makeProps({ viewMode: 'lobby' })} />);
    expect(screen.getByTestId('compact-brand')).toHaveTextContent('Sloplomacy');
    expect(screen.getByTestId('account-menu-trigger')).toBeInTheDocument();
    expect(
      screen.queryByTestId('compact-back-lobby-btn'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('compact-tools-toggle'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('turn-chronicle-pill')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-trigger'),
    ).not.toBeInTheDocument();
  });

  it('shows ←, ≡, TurnChronicle, GameSettingsMenu, and AccountDropdownMenu in a game', async () => {
    const onToggleTools = vi.fn();
    const onSelectHistoryTurn = vi.fn();
    const { rerender, ...view } = render(
      <CompactTopBar
        {...makeProps({
          onToggleTools,
          toolsOpen: false,
          historyEntries: [
            { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
          ],
          turn: { season: 'Fall', year: 1901, phase: 'Movement' },
          onSelectHistoryTurn,
        })}
      />,
    );

    const toolsToggle = screen.getByTestId('compact-tools-toggle');
    expect(toolsToggle).toHaveAttribute('aria-label', 'Tools');
    await userEvent.click(toolsToggle);
    expect(onToggleTools).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('compact-back-lobby-btn'));
    expect(screen.getByTestId('compact-back-lobby-btn')).toHaveAttribute(
      'aria-label',
      'Back to lobby',
    );

    expect(screen.getByTestId('turn-chronicle-pill')).toHaveTextContent(
      'Fall 1901 Movement',
    );
    await userEvent.click(screen.getByTestId('turn-history-select'));
    await userEvent.click(screen.getByTestId('turn-history-option-0'));
    expect(onSelectHistoryTurn).toHaveBeenCalledWith(0);

    expect(screen.getByTestId('game-settings-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('account-menu-trigger')).toBeInTheDocument();

    rerender(
      <CompactTopBar
        {...makeProps({
          onToggleTools,
          toolsOpen: true,
        })}
      />,
    );
    expect(screen.getByTestId('compact-tools-toggle')).toHaveAttribute(
      'aria-label',
      'Close tools',
    );
    view.unmount();
  });

  it('wires sandbox and multiplayer GameSettingsMenu actions (flask/crown, save/reset/delete/return/surrender, administrator + red badge)', async () => {
    const onSaveSandbox = vi.fn();
    const onResetSandbox = vi.fn();
    const onDeleteSandbox = vi.fn();
    const onReturnToPreviousGame = vi.fn();
    const onSurrenderClick = vi.fn();
    const onToggleAdminOverride = vi.fn();

    const { rerender } = render(
      <CompactTopBar
        {...makeProps({
          viewMode: 'sandbox',
          matchSummary: {
            ...MATCH,
            game_id: 'sbx_saved_1',
            name: 'Balkans Study',
            is_sandbox: true,
            is_draft: false,
          },
          isGameCreator: true,
          onSaveSandbox,
          onResetSandbox,
          onDeleteSandbox,
          onReturnToPreviousGame,
          onToggleAdminOverride,
        })}
      />,
    );

    const trigger = screen.getByTestId('game-settings-trigger');
    expect(trigger).toHaveAttribute('data-icon', 'flask');
    expect(trigger).toHaveAttribute('data-admin-active', 'false');

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-save-sandbox'));
    expect(onSaveSandbox).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-reset-sandbox'));
    expect(onResetSandbox).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-delete-sandbox'));
    expect(onDeleteSandbox).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-return-previous'));
    expect(onReturnToPreviousGame).toHaveBeenCalledTimes(1);

    rerender(
      <CompactTopBar
        {...makeProps({
          viewMode: 'multiplayer',
          matchSummary: MATCH,
          isGameCreator: true,
          adminOverrideActive: true,
          onSurrenderClick,
          isSurrendered: false,
          onToggleAdminOverride,
        })}
      />,
    );
    expect(trigger).toHaveAttribute('data-icon', 'crown');
    expect(trigger).toHaveAttribute('data-admin-active', 'true');

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    expect(screen.getByTestId('btn-toggle-direct-edit')).toHaveAttribute(
      'data-active',
      'true',
    );
    await userEvent.click(screen.getByTestId('game-settings-back'));
    await userEvent.click(screen.getByTestId('game-settings-surrender'));
    expect(onSurrenderClick).toHaveBeenCalledTimes(1);
  });

  it('wires AccountDropdownMenu Display Settings (outside lobby), Switch Game, and Sign In/Out', async () => {
    const onSignIn = vi.fn();
    const onSignOut = vi.fn();
    const onSwitchToSoloSandbox = vi.fn();
    const onSelectGame = vi.fn();
    const { rerender } = render(
      <CompactTopBar
        {...makeProps({
          viewMode: 'lobby',
          onSignIn,
          onSignOut,
          onSwitchToSoloSandbox,
          onSelectGame,
        })}
      />,
    );

    const trigger = screen.getByTestId('account-menu-trigger');
    await userEvent.click(trigger);
    expect(
      screen.queryByTestId('account-menu-display-settings'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('account-menu-signin'));
    expect(onSignIn).toHaveBeenCalledTimes(1);

    rerender(
      <CompactTopBar
        {...makeProps({
          viewMode: 'multiplayer',
          activeGameId: 'mp_1',
          matchSummary: MATCH,
          myGames: [MATCH],
          authUser: ALICE,
          onSignIn,
          onSignOut,
          onSwitchToSoloSandbox,
          onSelectGame,
        })}
      />,
    );

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('account-menu-display-settings'));
    expect(screen.getByTestId('account-menu-back')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('account-menu-back'));

    await userEvent.click(screen.getByTestId('account-menu-change-game'));
    await userEvent.click(screen.getByTestId('change-game-item-solo'));
    expect(onSwitchToSoloSandbox).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('account-menu-signout'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows the winner badge when won and opens GameOverModal on click', async () => {
    const onOpenGameOverModal = vi.fn();
    render(
      <CompactTopBar
        {...makeProps({
          winner: 'FRANCE',
          onOpenGameOverModal,
        })}
      />,
    );
    const pill = screen.getByTestId('game-over-pill');
    expect(pill).toHaveAttribute(
      'aria-label',
      'France wins. View campaign summary.',
    );
    await userEvent.click(pill);
    expect(onOpenGameOverModal).toHaveBeenCalledTimes(1);
  });
});

describe('SurrenderModal on a phone', () => {
  const renderModal = (summary: MultiplayerGameSummary) =>
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
    const html = renderModal(MATCH);
    expect(html).toContain('data-testid="surrender-choice-note"');
    expect(html).toMatch(
      /<p(?=[^>]*class="[^"]*compact-only")(?=[^>]*data-testid="surrender-choice-note")/,
    );
    expect(html).toContain('Spectate keeps you in the room as an observer');
  });

  it('has no such note before the match starts', () => {
    expect(renderModal({ ...MATCH, status: 'waiting' })).not.toContain(
      'data-testid="surrender-choice-note"',
    );
  });
});
