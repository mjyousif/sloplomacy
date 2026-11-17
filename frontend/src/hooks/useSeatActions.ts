import { type Dispatch, type SetStateAction, useState } from 'react';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import { authedFetch, getAuthHeaders } from '../lib/supabase';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../types/diplomacy';
import { myPowerIn } from '../utils/heroGame';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from '../utils/soloSandboxStorage';
import type { AuthModalTab } from './useAuthSession';

const API_BASE = '/api';

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
  sandboxMode?: boolean;
  sandboxGameId?: string | null;
  draftGameId?: string;
  setSandboxGameId?: Dispatch<SetStateAction<string | null>>;
  setSandboxMode: Dispatch<SetStateAction<boolean>>;
  setShowSimulationOverlay: Dispatch<SetStateAction<boolean>>;
  requireRealBoard: (action: string) => boolean;
  /** The passcodes typed for private matches during this visit. */
  matchPasscodes?: Record<string, string>;
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
  sandboxMode = false,
  sandboxGameId = null,
  draftGameId,
  setSandboxGameId,
  setSandboxMode,
  setShowSimulationOverlay,
  requireRealBoard,
  matchPasscodes,
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
  const [previousGame, setPreviousGame] = useState<{
    summary: MultiplayerGameSummary;
    power: Power;
  } | null>(null);

  const rememberCurrentGame = () => {
    if (
      viewMode !== 'lobby' &&
      activeGameSummary &&
      !activeGameSummary.is_draft
    ) {
      setPreviousGame({
        summary: activeGameSummary,
        power:
          lockedPower ?? myPowerIn(activeGameSummary, authUser) ?? 'FRANCE',
      });
    }
  };

  const clearPreviousGame = () => setPreviousGame(null);

  const openSoloSandbox = async (
    exportSourceGameId?: string,
    passcode?: string,
  ) => {
    rememberCurrentGame();
    try {
      setLoading(true);
      const storedDraftId = readStoredSoloSandboxId();
      const params = new URLSearchParams();
      if (storedDraftId) {
        params.set('resume_game_id', storedDraftId);
      }
      if (exportSourceGameId) {
        params.set('source_game_id', exportSourceGameId);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await authedFetch(`${API_BASE}/games/solo-sandbox${query}`, {
        method: 'POST',
        headers: passcode ? { 'X-Passcode': passcode } : undefined,
      });
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
      setSandboxGameId?.(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);
      setViewMode('sandbox');
      if (exportSourceGameId) {
        triggerToast('Current game state exported to a new Solo Sandbox.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast('Could not launch personal solo sandbox.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterSoloSandbox = async (event?: React.MouseEvent) => {
    const isExportingBoard = viewMode !== 'lobby' && Boolean(activeGameId);
    if (viewMode === 'multiplayer' && activeGameSummary) {
      const confirmLeave = await confirm(
        {
          title: 'Export to Solo Sandbox?',
          message: `Export the current state of "${activeGameSummary.name}" into your Solo Sandbox (overriding your previous draft sandbox). Your submitted match orders stay safe on the server.`,
          confirmLabel: 'Export & Switch',
        },
        event,
      );
      if (!confirmLeave) return;
    }
    await openSoloSandbox(
      isExportingBoard ? (draftGameId ?? activeGameId) : undefined,
      isExportingBoard ? matchPasscodes?.[activeGameId] : undefined,
    );
  };

  /** Opens or resumes the personal Solo Sandbox without exporting/overwriting from the current match. */
  const handleSwitchToSoloSandbox = async () => {
    await openSoloSandbox();
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
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name,
          creator_power: power,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
          is_private: Boolean(isPrivate),
          passcode: passcode?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not create multiplayer campaign.');
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
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
            display_name: authUser.displayName,
            passcode: passcode?.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || 'Unable to join power in this match.';
        triggerToast(msg);
        throw new Error(msg);
      }
      const data = await res.json();
      boardRequestSeq.current++;
      const typedPasscode = passcode?.trim();
      if (typedPasscode) {
        setMatchPasscodes((prev) => ({ ...prev, [gameId]: typedPasscode }));
      }
      if (sandboxGameId && gameId !== activeGameId) {
        authedFetch(
          `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(sandboxGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power }),
          },
        ).catch(() => {});
      }
      setActiveGameId(gameId);
      setActiveGameSummary(data.summary);
      applyServerState(data.state);
      setProvinces(data.provinces);
      setSelectedUnitId(null);
      setSandboxGameId?.(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);

      if (data.summary?.is_sandbox) {
        setLockedPower(null);
        setViewMode('sandbox');
      } else {
        setLockedPower(power);
        setViewMode('multiplayer');
      }
      if (!data.summary?.is_draft) {
        setPreviousGame(null);
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
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/surrender`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
            leave,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not process surrender action.');
        return;
      }
      const data = await res.json();
      if (leave) {
        setPreviousGame((prev) =>
          prev?.summary.game_id === gameId ? null : prev,
        );
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
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/leave`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not leave match.');
        return;
      }
      setPreviousGame((prev) =>
        prev?.summary.game_id === gameId ? null : prev,
      );
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
    // In multiplayer mode (outside Hypothetical Mode), country is locked to the player's claimed power
    if (viewMode === 'multiplayer' && lockedPower && !sandboxMode) {
      if (power !== lockedPower) {
        triggerToast(
          `Country locked: You are playing as ${POWER_METADATA[lockedPower].shortName} in this multiplayer campaign.`,
        );
      }
      return;
    }
    const targetGameId =
      sandboxMode && draftGameId ? draftGameId : activeGameId;
    try {
      const res = await authedFetch(
        `${API_BASE}/power?game_id=${encodeURIComponent(targetGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReturnToPreviousGame = async () => {
    if (!previousGame) return;
    await handleJoinOrEnterMultiplayerGame(
      previousGame.summary.game_id,
      previousGame.power,
      matchPasscodes?.[previousGame.summary.game_id],
    );
  };

  return {
    surrenderModalOpen,
    setSurrenderModalOpen,
    surrenderModalGame,
    surrenderModalPower,
    previousGame,
    rememberCurrentGame,
    clearPreviousGame,
    handleEnterSoloSandbox,
    handleSwitchToSoloSandbox,
    handleReturnToPreviousGame,
    handleCreateMultiplayerGame,
    handleJoinOrEnterMultiplayerGame,
    handleOpenSurrenderModal,
    handleSurrenderPower,
    handleLeaveGame,
    handleSelectPower,
  };
}
