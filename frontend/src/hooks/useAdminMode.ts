import { useState } from 'react';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import type {
  AuthUser,
  GameState,
  Power,
  ProvinceInfo,
} from '../types/diplomacy';
import { checkIsGameCreator } from '../utils/adminHelpers';
import type { ViewMode } from '../utils/viewMode';
import { useAdminDirectEdit } from './useAdminDirectEdit';

interface UseAdminModeOptions {
  viewMode: ViewMode;
  activeGameId: string;
  activeGameSummary: Parameters<typeof checkIsGameCreator>[0];
  lockedPower: Power | null;
  gameState: GameState | null;
  provinces: Record<string, ProvinceInfo>;
  authUser: AuthUser | null;
  applyServerState: (state: GameState) => void;
  fetchGamesList: () => unknown;
  triggerToast: (msg: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

/**
 * The creator's two admin modes, Turn and Clock Settings and Edit Board: whether each is open,
 * whether the caller is the creator, and the Edit Board session (`useAdminDirectEdit`).
 */
export function useAdminMode({
  viewMode,
  activeGameId,
  activeGameSummary,
  lockedPower,
  gameState,
  provinces,
  authUser,
  applyServerState,
  fetchGamesList,
  triggerToast,
  confirm,
}: UseAdminModeOptions) {
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] =
    useState<boolean>(false);
  const isGameCreator = checkIsGameCreator(
    activeGameSummary,
    authUser,
    viewMode,
  );
  const directEditActive = isGameCreator && adminOverrideActive;
  const handleAdminUpdateState = (st: GameState | null) => {
    if (!st) return;
    applyServerState(st);
    fetchGamesList();
  };
  const directEdit = useAdminDirectEdit({
    activeGameId,
    viewMode,
    lockedPower,
    gameState,
    provinces,
    directEditActive,
    setDirectEditActive: setAdminOverrideActive,
    authUser,
    onUpdateGameState: handleAdminUpdateState,
    showToast: triggerToast,
    confirm,
  });
  return {
    adminModalOpen,
    setAdminModalOpen,
    setAdminOverrideActive,
    isGameCreator,
    directEditActive,
    directEdit,
    handleAdminUpdateState,
  };
}
