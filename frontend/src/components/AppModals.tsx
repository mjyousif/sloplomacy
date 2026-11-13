import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { AuthModalTab } from '../hooks/useAuthSession';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type ValidationIssue,
} from '../types/diplomacy';
import { AccountModal } from './AccountModal';
import { AdminToolsModal } from './AdminToolsModal';
import { AuthModal } from './AuthModal';
import { SanityCheckModal } from './SanityCheckModal';
import { SaveSandboxModal } from './SaveSandboxModal';
import { SurrenderModal } from './SurrenderModal';

export interface AppModalsProps {
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  activeGameId: string;
  playerPower: Power;
  /** The Sanity Check modal, from `useMatchActions`. */
  sanityModalOpen: boolean;
  setSanityModalOpen: Dispatch<SetStateAction<boolean>>;
  sanityModalIssues: ValidationIssue[];
  handleFinalizeClick: (force?: boolean) => void;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
  setHighlightedProvinces: Dispatch<SetStateAction<string[]>>;
  /** The Surrender & Leave modal, from `useSeatActions`. */
  surrenderModalOpen: boolean;
  setSurrenderModalOpen: Dispatch<SetStateAction<boolean>>;
  surrenderModalGame: MultiplayerGameSummary | null;
  surrenderModalPower: Power | null;
  handleSurrenderPower: (
    gameId: string,
    power: Power,
    leave: boolean,
  ) => Promise<void>;
  handleLeaveGame: (gameId: string, power: Power) => Promise<void>;
  /** The Save Sandbox modal, from `useSandboxSession`. */
  saveSandboxModalOpen: boolean;
  setSaveSandboxModalOpen: Dispatch<SetStateAction<boolean>>;
  savingSandbox: boolean;
  handleSaveSandboxToAccount: (customName: string) => void;
  /** The host's admin console. */
  isGameCreator: boolean;
  adminModalOpen: boolean;
  setAdminModalOpen: Dispatch<SetStateAction<boolean>>;
  adminOverrideActive: boolean;
  setAdminOverrideActive: Dispatch<SetStateAction<boolean>>;
  applyServerState: (st: GameState) => void;
  fetchGamesList: () => Promise<void>;
  handleLoadScenario: (scenarioId: string) => void;
  triggerToast: (msg: string) => void;
  /** The sign-in modal, from `useAuthSession`. */
  authUser: AuthUser | null;
  setAuthUser: Dispatch<SetStateAction<AuthUser | null>>;
  authModalOpen: boolean;
  setAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  authModalTab: AuthModalTab;
  authModalReason: string | null;
  accountModalOpen?: boolean;
  setAccountModalOpen?: Dispatch<SetStateAction<boolean>>;
  accountModalOnboarding?: boolean;
  handleSignOut?: () => void;
  /** From `useConfirm`. */
  confirmModal: ReactNode;
}

/**
 * The app's modals, on the lobby and the board alike: the finalize Sanity Check, Surrender &
 * Leave, Save Sandbox, the host's admin console, sign-in, and the confirm prompt.
 */
export function AppModals({
  gameState,
  provinces,
  activeGameId,
  playerPower,
  sanityModalOpen,
  setSanityModalOpen,
  sanityModalIssues,
  handleFinalizeClick,
  setSelectedUnitId,
  setHighlightedProvinces,
  surrenderModalOpen,
  setSurrenderModalOpen,
  surrenderModalGame,
  surrenderModalPower,
  handleSurrenderPower,
  handleLeaveGame,
  saveSandboxModalOpen,
  setSaveSandboxModalOpen,
  savingSandbox,
  handleSaveSandboxToAccount,
  isGameCreator,
  adminModalOpen,
  setAdminModalOpen,
  adminOverrideActive,
  setAdminOverrideActive,
  applyServerState,
  fetchGamesList,
  handleLoadScenario,
  triggerToast,
  authUser,
  setAuthUser,
  authModalOpen,
  setAuthModalOpen,
  authModalTab,
  authModalReason,
  accountModalOpen = false,
  setAccountModalOpen,
  accountModalOnboarding = false,
  handleSignOut,
  confirmModal,
}: AppModalsProps) {
  return (
    <>
      {/* "ARE YOU SURE?" FINALIZE SANITY CHECK MODAL */}
      <SanityCheckModal
        isOpen={sanityModalOpen}
        power={playerPower}
        issues={sanityModalIssues}
        onClose={() => setSanityModalOpen(false)}
        onInspectIssue={(issue) => {
          setSanityModalOpen(false);
          if (issue.unit_ids.length > 0) {
            setSelectedUnitId(issue.unit_ids[0]);
          }
          setHighlightedProvinces(issue.provinces);
        }}
        onConfirmFinalizeAnyway={() => handleFinalizeClick(true)}
      />

      {/* SURRENDER & LEAVE MODAL */}
      <SurrenderModal
        isOpen={surrenderModalOpen}
        onClose={() => setSurrenderModalOpen(false)}
        game={surrenderModalGame}
        power={surrenderModalPower}
        onSurrender={handleSurrenderPower}
        onLeave={handleLeaveGame}
      />

      {/* SAVE SANDBOX MODAL */}
      <SaveSandboxModal
        isOpen={saveSandboxModalOpen}
        defaultName={
          authUser
            ? `${authUser.displayName}'s ${
                gameState?.season || 'Spring'
              } ${gameState?.year || 1901} Study (${
                POWER_METADATA[playerPower].shortName
              })`
            : 'Tactical Sandbox Study'
        }
        saving={savingSandbox}
        onSave={handleSaveSandboxToAccount}
        onCancel={() => setSaveSandboxModalOpen(false)}
      />

      {/* GAME CREATOR ADMINISTRATOR MODAL */}
      {isGameCreator && gameState && (
        <AdminToolsModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          gameId={activeGameId}
          gameState={gameState}
          provinces={provinces}
          user={authUser}
          onStateUpdated={(newState) => {
            applyServerState(newState);
            fetchGamesList();
          }}
          onToast={triggerToast}
          adminOverrideActive={adminOverrideActive}
          onToggleAdminOverride={() => setAdminOverrideActive((prev) => !prev)}
          onResetScenario={() => handleLoadScenario('standard_1901')}
        />
      )}

      {/* SUPABASE AUTHENTICATION MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
        reasonBanner={authModalReason}
        onSuccess={(u, msg) => {
          setAuthUser(u);
          if (msg) triggerToast(msg);
          fetchGamesList();
        }}
      />
      <AccountModal
        isOpen={accountModalOpen}
        user={authUser}
        onboarding={accountModalOnboarding}
        onClose={() => setAccountModalOpen?.(false)}
        onUpdated={(u, msg) => {
          setAuthUser(u);
          if (msg) triggerToast(msg);
          fetchGamesList();
        }}
        onSignOut={() => handleSignOut?.()}
      />
      {confirmModal}
    </>
  );
}
