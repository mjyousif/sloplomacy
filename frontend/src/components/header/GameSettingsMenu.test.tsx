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
  it('shows Game Settings header with country flag beside game name subtext and Open in Local Sandbox in multiplayer', async () => {
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
    const gameType = screen.getByTestId('game-settings-type');
    expect(gameType).toHaveTextContent('Live game');
    expect(
      within(gameType).getByTestId('game-settings-type-crown'),
    ).toBeInTheDocument();

    const soloBtn = screen.getByTestId('game-settings-solo-sandbox');
    expect(soloBtn).not.toHaveAttribute('data-active');
    expect(soloBtn).toHaveTextContent('Open in Local Sandbox');
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

  it('shows flask icon, Local sandbox type without game name, and omits Export to Solo Sandbox, Delete Sandbox, and Surrender in Local Sandbox mode', async () => {
    renderGameSettings({
      viewMode: 'sandbox',
      matchSummary: null,
      isGameCreator: true,
      onSurrenderClick: vi.fn(),
      onDeleteSandbox: vi.fn(),
    });
    const trigger = screen.getByTestId('game-settings-trigger');
    expect(trigger).toHaveAttribute('data-icon', 'flask');
    expect(trigger).toHaveAttribute('data-solo-sandbox', 'true');
    await userEvent.click(trigger);
    expect(
      screen.getByRole('heading', { name: 'Game Settings' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-subtitle'),
    ).not.toBeInTheDocument();
    const gameType = screen.getByTestId('game-settings-type');
    expect(gameType).toHaveTextContent('Local sandbox');
    expect(
      within(gameType).getByTestId('game-settings-type-flask'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-solo-sandbox'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-delete-sandbox'),
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

  it('treats a saved Solo Sandbox identically to a sandbox with Saved sandbox type and Save as New Sandbox', async () => {
    const onSaveSandbox = vi.fn();
    const onResetSandbox = vi.fn();
    const onDeleteSandbox = vi.fn();
    renderGameSettings({
      viewMode: 'sandbox',
      matchSummary: {
        game_id: 'sbx_saved_1',
        name: 'Balkans Study',
        is_sandbox: true,
        is_draft: false,
      } as MultiplayerGameSummary,
      isGameCreator: true,
      onSaveSandbox,
      onResetSandbox,
      onDeleteSandbox,
    });
    const trigger = screen.getByTestId('game-settings-trigger');
    expect(trigger).toHaveAttribute('data-icon', 'flask');
    expect(trigger).toHaveAttribute('data-solo-sandbox', 'true');

    await userEvent.click(trigger);
    expect(screen.getByTestId('game-settings-subtitle')).toHaveTextContent(
      'Balkans Study',
    );
    const gameType = screen.getByTestId('game-settings-type');
    expect(gameType).toHaveTextContent('Saved sandbox');
    expect(
      within(gameType).getByTestId('game-settings-type-flask'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('power-flag-france')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-settings-solo-sandbox'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('game-settings-admin-settings'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('game-settings-save-sandbox')).toHaveTextContent(
      'Save as New Sandbox',
    );
    const resetBtn = screen.getByTestId('game-settings-reset-sandbox');
    const deleteBtn = screen.getByTestId('game-settings-delete-sandbox');
    expect(deleteBtn).toHaveTextContent('Delete Sandbox');
    expect(
      resetBtn.compareDocumentPosition(deleteBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(deleteBtn);
    expect(onDeleteSandbox).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('game-settings-panel')).not.toBeInTheDocument();
  });

  it('shows Save Sandbox, Reset Sandbox, and Return to Previous Game below Administrator in local Solo Sandbox without Delete Sandbox', async () => {
    const onSaveSandbox = vi.fn();
    const onResetSandbox = vi.fn();
    const onDeleteSandbox = vi.fn();
    const onReturnToPreviousGame = vi.fn();
    renderGameSettings({
      viewMode: 'sandbox',
      matchSummary: null,
      isGameCreator: true,
      onSaveSandbox,
      onResetSandbox,
      onDeleteSandbox,
      onReturnToPreviousGame,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    const adminBtn = screen.getByTestId('game-settings-admin-settings');
    const saveBtn = screen.getByTestId('game-settings-save-sandbox');
    const resetBtn = screen.getByTestId('game-settings-reset-sandbox');
    const returnBtn = screen.getByTestId('game-settings-return-previous');
    expect(saveBtn).toHaveTextContent('Save Sandbox');
    expect(resetBtn).toHaveTextContent('Reset Sandbox');
    expect(
      screen.queryByTestId('game-settings-delete-sandbox'),
    ).not.toBeInTheDocument();
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
