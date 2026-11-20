import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import type { AuthUser, MultiplayerGameSummary } from '../types/diplomacy';
import { myPowerIn } from '../utils/heroGame';
import type { ViewMode } from '../utils/viewMode';
import type { useSeatActions } from './useSeatActions';

export interface BoardExitsOptions {
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  authUser: AuthUser | null;
  seats: ReturnType<typeof useSeatActions>;
  /** Asks before throwing away Edit Board changes still staged; false when the player stays. */
  confirmIfDirty: (action: string) => Promise<boolean>;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  closeAdminTools: () => void;
  goLive: () => void;
  handleLoadScenario: (scenario: string) => Promise<void>;
  fetchGamesList: () => void;
}

/**
 * The ways off the board on show: back to the lobby, into the Solo Sandbox, to another game
 * or the previous one, and resetting or deleting a sandbox. Each asks first while Edit Board
 * changes are still staged, and closes the admin tools.
 */
export function useBoardExits({
  setViewMode,
  authUser,
  seats,
  confirmIfDirty,
  confirm,
  closeAdminTools,
  goLive,
  handleLoadScenario,
  fetchGamesList,
}: BoardExitsOptions) {
  /** Back to the lobby, keeping any seat. False when the player chose to stay. */
  const handleBackToLobby = async (): Promise<boolean> => {
    if (!(await confirmIfDirty('return to the lobby'))) return false;
    seats.rememberCurrentGame();
    setViewMode('lobby');
    fetchGamesList();
    return true;
  };
  const guardedEnterSoloSandbox = async (event?: React.MouseEvent) => {
    if (!(await confirmIfDirty('open the Solo Sandbox'))) return;
    closeAdminTools();
    seats.handleEnterSoloSandbox(event);
  };
  const guardedResetSandbox = async (event?: React.MouseEvent) => {
    if (!(await confirmIfDirty('reset the sandbox'))) return;
    const ok = await confirm(
      {
        title: 'Reset Sandbox?',
        message:
          'Reset this sandbox to Standard Spring 1901? All current orders and board changes will be lost.',
        confirmLabel: 'Reset Sandbox',
      },
      event,
    );
    if (!ok) return;
    goLive();
    closeAdminTools();
    await handleLoadScenario('standard_1901');
  };
  const guardedDeleteSandbox = async (event?: React.MouseEvent) => {
    if (!(await confirmIfDirty('delete this sandbox'))) return;
    closeAdminTools();
    await seats.handleDeleteSandbox(event);
  };
  const guardedSwitchToSoloSandbox = async () => {
    if (!(await confirmIfDirty('switch to Solo Sandbox'))) return;
    closeAdminTools();
    await seats.handleSwitchToSoloSandbox();
  };
  const guardedSwitchToGame = async (game: MultiplayerGameSummary) => {
    if (!(await confirmIfDirty('switch games'))) return;
    closeAdminTools();
    const power = myPowerIn(game, authUser) ?? 'FRANCE';
    await seats.handleJoinOrEnterMultiplayerGame(game.game_id, power);
  };
  const guardedReturnToPreviousGame = seats.previousGame
    ? async () => {
        if (!(await confirmIfDirty('return to the previous game'))) return;
        closeAdminTools();
        await seats.handleReturnToPreviousGame();
      }
    : undefined;

  return {
    handleBackToLobby,
    guardedEnterSoloSandbox,
    guardedResetSandbox,
    guardedDeleteSandbox,
    guardedSwitchToSoloSandbox,
    guardedSwitchToGame,
    guardedReturnToPreviousGame,
  };
}
