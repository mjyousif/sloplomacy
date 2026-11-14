import { type Dispatch, type SetStateAction, useState } from 'react';
import {
  clearForeignPreMoves,
  enterSandboxMode,
  exitSandboxMode,
  generateSandboxAiOrders,
  loadScenario,
  readErrorDetail,
  saveSandboxToAccount,
  stepTurnWithAi,
} from '../api';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  type PhaseTimer,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from '../utils/soloSandboxStorage';
import type { AuthModalTab } from './useAuthSession';

export interface SandboxSessionOptions {
  activeGameId: string;
  setActiveGameId: Dispatch<SetStateAction<string>>;
  setActiveGameSummary: Dispatch<SetStateAction<MultiplayerGameSummary | null>>;
  gameState: GameState | null;
  playerPower: Power;
  authUser: AuthUser | null;
  openAuthPrompt: (reason?: string, tab?: AuthModalTab) => void;
  triggerToast: (msg: string) => void;
  /** From `useTurnHistory`: back to the live turn. */
  goLive: () => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
  /** From `useGameSession`. */
  applyServerState: (st: GameState) => void;
  fetchGame: (gid?: string, targetPower?: Power | null) => Promise<void>;
  fetchGamesList: () => Promise<void>;
}

/**
 * The sandbox tools: Hypothetical Mode (on a private server-side copy of a multiplayer match,
 * or on the board itself in a solo or saved sandbox), the tactical AI, the scenario reset and
 * saving a sandbox to the player's account. It runs no effects: closing the private copy when
 * the player leaves the match board is `useSandboxExit`, which App calls later so it keeps its
 * place after `useGameSync`'s effects.
 */
export function useSandboxSession({
  activeGameId,
  setActiveGameId,
  setActiveGameSummary,
  gameState,
  playerPower,
  authUser,
  openAuthPrompt,
  triggerToast,
  goLive,
  setLoading,
  setSelectedUnitId,
  applyServerState,
  fetchGame,
  fetchGamesList,
}: SandboxSessionOptions) {
  const [sandboxMode, setSandboxMode] = useState<boolean>(false);
  // A multiplayer sandbox runs on a private server-side copy of the match under its own game id.
  const [sandboxGameId, setSandboxGameId] = useState<string | null>(null);
  // The private copy has no clock, so this follows the real match while the player is in it.
  const [hypotheticalMatchTimer, setHypotheticalMatchTimer] =
    useState<PhaseTimer | null>(null);
  const [showSimulationOverlay, setShowSimulationOverlay] =
    useState<boolean>(false);
  const [saveSandboxModalOpen, setSaveSandboxModalOpen] =
    useState<boolean>(false);
  const [savingSandbox, setSavingSandbox] = useState<boolean>(false);

  // Drafts, AI plans and previews go to the private copy while there is one.
  const draftGameId = sandboxGameId ?? activeGameId;
  const matchTimer = sandboxGameId
    ? hypotheticalMatchTimer
    : (gameState?.timer ?? null);

  // The board in a private sandbox is hypothetical, so nothing real can be done from it.
  const requireRealBoard = (action: string): boolean => {
    if (!sandboxGameId) return true;
    triggerToast(`Exit Hypothetical Mode to ${action}.`);
    return false;
  };

  const handleGenerateAIMoves = async (
    powers?: Power[],
    includeActive: boolean = false,
  ) => {
    const foreignPowers = (Object.keys(POWER_METADATA) as Power[]).filter(
      (p) => p !== playerPower,
    );
    try {
      setLoading(true);
      const res = await generateSandboxAiOrders({
        query: { game_id: draftGameId },
        body: {
          powers: powers || (includeActive ? null : foreignPowers),
          include_active: includeActive,
        },
      });
      if (!res.ok) {
        triggerToast(
          await readErrorDetail(res, 'Failed to generate AI orders.'),
        );
        return;
      }
      const updatedState = await res.json();
      applyServerState(updatedState);
      triggerToast(
        includeActive
          ? 'Tactical AI planned orders for all 7 Great Powers!'
          : powers && powers.length === 1
            ? `Tactical AI planned orders for ${POWER_METADATA[powers[0]].shortName}!`
            : 'Tactical AI planned orders for foreign powers!',
      );
    } catch (e: any) {
      console.error(e);
      triggerToast('Error generating AI orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleAIStepTurn = async () => {
    try {
      setLoading(true);
      const res = await stepTurnWithAi({
        query: { game_id: draftGameId },
      });
      if (!res.ok) {
        triggerToast(
          await readErrorDetail(res, 'Failed to step turn with AI.'),
        );
        return;
      }
      const updatedState = await res.json();
      applyServerState(updatedState);
      setSelectedUnitId(null);
      setShowSimulationOverlay(false);
      triggerToast(
        `AI advanced game clock to ${updatedState.season} ${updatedState.year} ${updatedState.phase}!`,
      );
    } catch (e: any) {
      console.error(e);
      triggerToast('Error stepping turn with AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSaveSandboxModal = () => {
    if (!authUser) {
      openAuthPrompt(
        'Sign in or create a free account to save this tactical sandbox scenario to your profile.',
        'signup',
      );
      return;
    }
    setSaveSandboxModalOpen(true);
  };

  const handleSaveSandboxToAccount = async (customName: string) => {
    if (!authUser) return;
    try {
      setSavingSandbox(true);
      const res = await saveSandboxToAccount({
        query: { game_id: activeGameId },
        body: {
          name: customName,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
        },
      });
      if (!res.ok) {
        triggerToast(await readErrorDetail(res, 'Could not save sandbox.'));
        return;
      }
      const saved: MultiplayerGameSummary = await res.json();
      if (saved.game_id === readStoredSoloSandboxId()) {
        writeStoredSoloSandboxId(null);
      }
      setActiveGameId(saved.game_id);
      setActiveGameSummary(saved);
      await fetchGamesList();
      setSaveSandboxModalOpen(false);
      triggerToast(`Saved "${saved.name}" to your account!`);
    } catch (e: any) {
      console.error(e);
      triggerToast('Error saving sandbox to account.');
    } finally {
      setSavingSandbox(false);
    }
  };

  const handleClearForeignPreMoves = async () => {
    if (!gameState) return;
    try {
      const res = await clearForeignPreMoves({
        query: { game_id: draftGameId },
        body: { power: playerPower },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast('Cleared all hypothetical foreign pre-moves.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleSandboxMode = async () => {
    if (!gameState) return;
    const entering = !sandboxMode;
    if (entering) goLive();
    try {
      if (entering) {
        const res = await enterSandboxMode({
          query: { game_id: activeGameId },
          body: { power: playerPower },
        });
        if (!res.ok) {
          triggerToast(
            await readErrorDetail(res, 'Could not open the sandbox.'),
          );
          return;
        }
        const st: GameState = await res.json();
        setHypotheticalMatchTimer(gameState.timer ?? null);
        applyServerState(st);
        setSandboxGameId(st.game_id === activeGameId ? null : st.game_id);
        setSandboxMode(true);
        setShowSimulationOverlay(true);
        triggerToast(
          'Entered Hypothetical Mode: Plot hypothetical foreign moves to test outcomes. Exiting will discard foreign guesses!',
        );
      } else {
        const res = await exitSandboxMode({
          query: { game_id: draftGameId },
          body: { power: playerPower },
        });
        let turnMovedOn = false;
        if (res.ok) {
          const st: GameState = await res.json();
          turnMovedOn =
            st.season !== gameState.season ||
            st.year !== gameState.year ||
            st.phase !== gameState.phase;
          applyServerState(st);
        } else if (sandboxGameId) {
          // The private copy is gone, for example after a server restart: show the real match.
          await fetchGame(activeGameId);
        }
        setSandboxGameId(null);
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast(
          sandboxGameId && turnMovedOn
            ? 'The match moved on while in Hypothetical Mode, so hypothetical orders were not kept.'
            : `Exited Hypothetical Mode — foreign guesses discarded. Showing only ${
                POWER_METADATA[playerPower].shortName
              }'s real orders.`,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadScenario = async (scenarioId: string) => {
    try {
      const res = await loadScenario({
        query: { game_id: activeGameId },
        body: {
          scenario_id: scenarioId,
          active_power: playerPower,
        },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSandboxGameId(null);
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast('Reset to Standard Spring 1901.');
      } else {
        triggerToast(
          await readErrorDetail(res, 'Could not reset the scenario.'),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  return {
    sandboxMode,
    setSandboxMode,
    sandboxGameId,
    setSandboxGameId,
    setHypotheticalMatchTimer,
    showSimulationOverlay,
    setShowSimulationOverlay,
    saveSandboxModalOpen,
    setSaveSandboxModalOpen,
    savingSandbox,
    draftGameId,
    matchTimer,
    requireRealBoard,
    handleGenerateAIMoves,
    handleAIStepTurn,
    handleOpenSaveSandboxModal,
    handleSaveSandboxToAccount,
    handleClearForeignPreMoves,
    handleToggleSandboxMode,
    handleLoadScenario,
  };
}
