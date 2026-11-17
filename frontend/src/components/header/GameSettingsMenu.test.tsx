// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MultiplayerGameSummary } from '../../types/diplomacy';
import {
  GameSettingsMenu,
  type GameSettingsMenuProps,
} from './GameSettingsMenu';

const MATCH = {
  game_id: 'mp_1',
  name: 'Imperial Concert',
  is_sandbox: false,
  is_draft: false,
} as MultiplayerGameSummary;

function renderGameSettings(overrides: Partial<GameSettingsMenuProps> = {}) {
  const props: GameSettingsMenuProps = {
    viewMode: 'multiplayer',
    matchSummary: MATCH,
    playerPower: 'FRANCE',
    onEnterSoloSandbox: vi.fn(),
    isGameCreator: false,
    ...overrides,
  };
  const view = render(<GameSettingsMenu {...props} />);
  return { ...view, props };
}

describe('GameSettingsMenu', () => {
  it('shows Game Settings header with country flag beside game name subtext and Export to Solo Sandbox in multiplayer', async () => {
    const { props } = renderGameSettings();
    const trigger = screen.getByTestId('game-settings-trigger');
    expect(trigger).toHaveTextContent('');
    expect(trigger).toHaveAttribute('aria-label', 'Game Settings');
    expect(trigger).toHaveAttribute('data-icon', 'crown');
    expect(trigger).toHaveAttribute('data-solo-sandbox', 'false');
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(
      screen.getByRole('heading', { name: 'Game Settings' }),
    ).toBeInTheDocument();
    const subtitle = screen.getByTestId('game-settings-subtitle');
    expect(subtitle).toHaveTextContent('Imperial Concert');
    expect(within(subtitle).getByTestId('power-flag-france')).toBeVisible();

    const soloBtn = screen.getByTestId('game-settings-solo-sandbox');
    expect(soloBtn).not.toHaveAttribute('data-active');
    expect(soloBtn).toHaveTextContent('Export to Solo Sandbox');
    expect(
      screen.queryByTestId('game-settings-save-sandbox'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-reset-sandbox'),
    ).not.toBeInTheDocument();

    await userEvent.click(soloBtn);
    expect(props.onEnterSoloSandbox).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();
  });

  it('shows flask icon, Solo Sandbox subtext, and omits Export to Solo Sandbox and Surrender in Solo Sandbox mode', async () => {
    renderGameSettings({
      viewMode: 'sandbox',
      matchSummary: null,
      isGameCreator: true,
      onSurrenderClick: vi.fn(),
    });
    const trigger = screen.getByTestId('game-settings-trigger');
    expect(trigger).toHaveAttribute('data-icon', 'flask');
    expect(trigger).toHaveAttribute('data-solo-sandbox', 'true');
    await userEvent.click(trigger);
    expect(
      screen.getByRole('heading', { name: 'Game Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('game-settings-subtitle')).toHaveTextContent(
      'Solo Sandbox',
    );
    expect(
      screen.queryByTestId('game-settings-solo-sandbox'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-surrender'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('game-settings-admin-settings'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-return-previous'),
    ).not.toBeInTheDocument();
  });

  it('shows Save Sandbox, Reset Sandbox, and Return to Previous Game below Administrator in Solo Sandbox mode when provided', async () => {
    const onSaveSandbox = vi.fn();
    const onResetSandbox = vi.fn();
    const onReturnToPreviousGame = vi.fn();
    renderGameSettings({
      viewMode: 'sandbox',
      matchSummary: null,
      isGameCreator: true,
      onSaveSandbox,
      onResetSandbox,
      onReturnToPreviousGame,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    const adminBtn = screen.getByTestId('game-settings-admin-settings');
    const saveBtn = screen.getByTestId('game-settings-save-sandbox');
    const resetBtn = screen.getByTestId('game-settings-reset-sandbox');
    const returnBtn = screen.getByTestId('game-settings-return-previous');
    expect(saveBtn).toHaveTextContent('Save Sandbox');
    expect(resetBtn).toHaveTextContent('Reset Sandbox');
    expect(returnBtn).toHaveTextContent('Return to Previous Game');
    expect(
      adminBtn.compareDocumentPosition(saveBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      saveBtn.compareDocumentPosition(resetBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      resetBtn.compareDocumentPosition(returnBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(saveBtn);
    expect(onSaveSandbox).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-reset-sandbox'));
    expect(onResetSandbox).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-return-previous'));
    expect(onReturnToPreviousGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();
  });

  it('shows Surrender only in an active non-surrendered multiplayer seat and invokes handler', async () => {
    const onSurrenderClick = vi.fn();
    const { rerender, props } = renderGameSettings({
      viewMode: 'multiplayer',
      onSurrenderClick,
      isSurrendered: false,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    const surrenderBtn = screen.getByTestId('game-settings-surrender');
    expect(surrenderBtn).toHaveTextContent('Surrender');
    await userEvent.click(surrenderBtn);
    expect(onSurrenderClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();

    rerender(<GameSettingsMenu {...props} isSurrendered={true} />);
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    expect(
      screen.queryByTestId('game-settings-surrender'),
    ).not.toBeInTheDocument();
  });

  it('shows Administrator submenu only for the game creator outside the lobby', async () => {
    const onOpenAdminTools = vi.fn();
    const onToggleAdminOverride = vi.fn();
    const onResolveTurn = vi.fn();
    const onExitAdmin = vi.fn();

    const { rerender, props } = renderGameSettings({
      isGameCreator: false,
      onOpenAdminTools,
      onToggleAdminOverride,
      onResolveTurn,
      onExitAdmin,
    });

    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    expect(
      screen.queryByTestId('game-settings-admin-settings'),
    ).not.toBeInTheDocument();

    rerender(
      <GameSettingsMenu
        {...props}
        isGameCreator={true}
        adminOverrideActive={true}
      />,
    );

    expect(screen.getByTestId('game-settings-trigger')).toHaveAttribute(
      'data-admin-active',
      'true',
    );
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    expect(screen.getByTestId('admin-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-direct-edit')).toHaveAttribute(
      'data-active',
      'true',
    );

    await userEvent.click(screen.getByTestId('game-settings-back'));
    expect(
      screen.getByTestId('game-settings-solo-sandbox'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    await userEvent.click(screen.getByTestId('btn-exit-admin-mode'));
    expect(onExitAdmin).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to trigger', async () => {
    renderGameSettings();
    const trigger = screen.getByTestId('game-settings-trigger');
    await userEvent.click(trigger);
    expect(screen.getByTestId('game-settings-panel')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
