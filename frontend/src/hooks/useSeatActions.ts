import { type Dispatch, type SetStateAction, useState } from 'react';
import {
  createMultiplayerGame,
  createSoloSandbox,
  joinMultiplayerGame,
  leaveGame,
  readErrorDetail,
  setActivePower,
  surrenderPower,
} from '../api';
import type { ConfirmOptions } from '../components/ConfirmModal';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../types/diplomacy';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from '../utils/soloSandboxStorage';
import type { AuthModalTab } from './useAuthSession';

type ViewMode = 'lobby' | 'sandbox' | 'multiplayer';

export interface SeatActionsOptions {
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  /** From `useGameSession`. */
  activeGameId: string;
  setActiveGameId: Dispatch<SetStateAction<string>>;
  activeGameSummary: MultiplayerGameSummary | null;
  setActiveGameSummary: Dispatch<SetStateAction<MultiplayerGameSummary | null>>;
  lockedPower: Power | null;
  setLockedPower: Dispatch<SetStateAction<Power | null>>;
  setProvinces: Dispatch<SetStateAction<Record<string, ProvinceInfo>>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  /** Bumped before a board arrives from another game, so an older reply is dropped. */
  boardRequestSeq: { current: number };
  applyServerState: (st: GameState) => void;
  fetchGamesList: () => Promise<void>;
  /** From `useAuthSession`. */
  authUser: AuthUser | null;
  openAuthPrompt: (reason?: string, tab?: AuthModalTab) => void;
  /** From `useSandboxSession`. */
  setSandboxMode: Dispatch<SetStateAction<boolean>>;
  setShowSimulationOverlay: Dispatch<SetStateAction<boolean>>;
  requireRealBoard: (action: string) => boolean;
  /** The passcodes typed for private matches during this visit. */
  setMatchPasscodes: Dispatch<SetStateAction<Record<string, string>>>;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  triggerToast: (msg: string) => void;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
}

/**
 * Taking and giving up a seat: open the Solo Sandbox, create a match, join one, surrender
 * (through the Surrender & Leave modal) or leave, and pick the power to command on a
 * sandbox board. Joining or creating needs an account, so a guest gets the sign-in prompt.
 */
export function useSeatActions({
  viewMode,
  setViewMode,
  activeGameId,
  setActiveGameId,
  activeGameSummary,
  setActiveGameSummary,
  lockedPower,
  setLockedPower,
  setProvinces,
  setLoading,
  boardRequestSeq,
  applyServerState,
  fetchGamesList,
  authUser,
  openAuthPrompt,
  setSandboxMode,
  setShowSimulationOverlay,
  requireRealBoard,
  setMatchPasscodes,
  confirm,
  triggerToast,
  setSelectedUnitId,
}: SeatActionsOptions) {
  // Surrender & Leave Modal State
  const [surrenderModalOpen, setSurrenderModalOpen] = useState<boolean>(false);
  const [surrenderModalGame, setSurrenderModalGame] =
    useState<MultiplayerGameSummary | null>(null);
  const [surrenderModalPower, setSurrenderModalPower] = useState<Power | null>(
    null,
  );

  const handleEnterSoloSandbox = async (event?: React.MouseEvent) => {
    if (viewMode === 'multiplayer' && activeGameSummary) {
      const confirmLeave = await confirm(
        {
          title: 'Switch to the Solo Sandbox?',
          message: `You leave match "${activeGameSummary.name}" for the Solo Sandbox board. Your submitted orders remain safe on the server.`,
          confirmLabel: 'Switch',
        },
        event,
      );
      if (!confirmLeave) return;
    }
    try {
      setLoading(true);
      const storedDraftId = readStoredSoloSandboxId();
      const res = await createSoloSandbox(
        storedDraftId ? { query: { resume_game_id: storedDraftId } } : {},
      );
      if (!res.ok) {
        throw new Error(`Failed to create solo sandbox (${res.status})`);
      }
      const data = await res.json();
      boardRequestSeq.current++;
      if (data.summary?.is_draft) {
        writeStoredSoloSandboxId(data.state.game_id);
      }
      setActiveGameId(data.state.game_id);
      setActiveGameSummary(data.summary);
      applyServerState(data.state);
      setProvinces(data.provinces);
      setSelectedUnitId(null);
      setLockedPower(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);
      setViewMode('sandbox');
    } catch (err: any) {
      console.error(err);
      triggerToast('Could not launch personal solo sandbox.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMultiplayerGame = async (
    name: string,
    power: Power,
    isPrivate?: boolean,
    passcode?: string,
  ): Promise<MultiplayerGameSummary | void> => {
    if (!authUser) {
      openAuthPrompt('Please sign in to create a multiplayer game.', 'signup');
      return;
    }
    try {
      const res = await createMultiplayerGame({
        auth: 'headers',
        body: {
          name,
          creator_power: power,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
          is_private: Boolean(isPrivate),
          passcode: passcode?.trim() || null,
        },
      });
      if (!res.ok) {
        triggerToast(
          await readErrorDetail(res, 'Could not create multiplayer campaign.'),
        );
        return;
      }
      const summary: MultiplayerGameSummary = await res.json();
      await fetchGamesList();
      if (!isPrivate || !passcode) {
        await handleJoinOrEnterMultiplayerGame(summary.game_id, power);
        triggerToast(
          `Created "${summary.name}" — You are commanding ${POWER_METADATA[power].shortName}!`,
        );
      }
      return summary;
    } catch (e) {
      console.error(e);
    }
  };

  const handleJoinOrEnterMultiplayerGame = async (
    gameId: string,
    power: Power,
    passcode?: string,
  ) => {
    if (!authUser) {
      openAuthPrompt(
        `Sign in to claim ${POWER_METADATA[power].shortName} and play multiplayer.`,
        'signin',
      );
      return;
    }
    try {
      const res = await joinMultiplayerGame({
        path: { game_id: gameId },
        body: {
          power,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
          passcode: passcode?.trim() || null,
        },
      });
      if (!res.ok) {
        const msg = await readErrorDetail(
          res,
          'Unable to join power in this match.',
        );
        triggerToast(msg);
        throw new Error(msg);
      }
      const data = await res.json();
      boardRequestSeq.current++;
      const typedPasscode = passcode?.trim();
      if (typedPasscode) {
        setMatchPasscodes((prev) => ({ ...prev, [gameId]: typedPasscode }));
      }
      setActiveGameId(gameId);
      setActiveGameSummary(data.summary);
      applyServerState(data.state);
      setProvinces(data.provinces);
      setSelectedUnitId(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);

      if (data.summary?.is_sandbox) {
        setLockedPower(null);
        setViewMode('sandbox');
      } else {
        setLockedPower(power);
        setViewMode('multiplayer');
      }
      await fetchGamesList();
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleOpenSurrenderModal = (
    game: MultiplayerGameSummary,
    power: Power,
  ) => {
    if (!requireRealBoard('surrender')) return;
    setSurrenderModalGame(game);
    setSurrenderModalPower(power);
    setSurrenderModalOpen(true);
  };

  const handleSurrenderPower = async (
    gameId: string,
    power: Power,
    leave: boolean,
  ) => {
    if (!authUser) {
      openAuthPrompt(
        'Please sign in to manage your sovereign position.',
        'signin',
      );
      return;
    }
    try {
      const res = await surrenderPower({
        path: { game_id: gameId },
        body: {
          power,
          user_id: authUser.id,
          email: authUser.email,
          leave,
        },
      });
      if (!res.ok) {
        triggerToast(
          await readErrorDetail(res, 'Could not process surrender action.'),
        );
        return;
      }
      const data = await res.json();
      if (leave) {
        if (activeGameId === gameId) {
          setViewMode('lobby');
          setLockedPower(null);
          setActiveGameSummary(null);
        }
        triggerToast(
          `Surrendered command of ${POWER_METADATA[power].shortName} and left match.`,
        );
      } else {
        applyServerState(data.state);
        if (data.summary) setActiveGameSummary(data.summary);
        triggerToast(
          `Command of ${POWER_METADATA[power].shortName} surrendered. Units stand in Civil Disorder.`,
        );
      }
      await fetchGamesList();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLeaveGame = async (gameId: string, power: Power) => {
    if (!authUser) {
      openAuthPrompt('Please sign in to leave this campaign.', 'signin');
      return;
    }
    try {
      const res = await leaveGame({
        path: { game_id: gameId },
        body: {
          power,
          user_id: authUser.id,
          email: authUser.email,
        },
      });
      if (!res.ok) {
        triggerToast(await readErrorDetail(res, 'Could not leave match.'));
        return;
      }
      if (activeGameId === gameId) {
        setViewMode('lobby');
        setLockedPower(null);
        setActiveGameSummary(null);
      }
      triggerToast('Left campaign.');
      await fetchGamesList();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPower = async (power: Power) => {
    // In multiplayer mode, country is locked to the player's claimed power
    if (viewMode === 'multiplayer' && lockedPower) {
      if (power !== lockedPower) {
        triggerToast(
          `Country locked: You are playing as ${POWER_METADATA[lockedPower].shortName} in this multiplayer campaign.`,
        );
      }
      return;
    }
    try {
      const res = await setActivePower({
        query: { game_id: activeGameId },
        body: { power },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return {
    surrenderModalOpen,
    setSurrenderModalOpen,
    surrenderModalGame,
    surrenderModalPower,
    handleEnterSoloSandbox,
    handleCreateMultiplayerGame,
    handleJoinOrEnterMultiplayerGame,
    handleOpenSurrenderModal,
    handleSurrenderPower,
    handleLeaveGame,
    handleSelectPower,
  };
}
