import type React from 'react';
import { useState } from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { isVisibleInMyActiveCampaigns } from '../utils/gameOverHelpers';
import { VersionBadge } from './header/VersionBadge';
import styles from './LobbyView.module.css';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { GameBrowser } from './lobby/GameBrowser';
import { useHostGameForm } from './lobby/hooks/useHostGameForm';
import { useJoinWithCodeForm } from './lobby/hooks/useJoinWithCodeForm';
import { JoinWithCodeCard } from './lobby/JoinWithCodeCard';
import { LobbyActionRow } from './lobby/LobbyActionRow';
import { LobbyFormDialog } from './lobby/LobbyFormDialog';
import { LobbyHero } from './lobby/LobbyHero';
import { MyGamesSection } from './lobby/MyGamesSection';
import { PrivateCampaignCreatedModal } from './lobby/PrivateCampaignCreatedModal';

interface LobbyViewProps {
  user: AuthUser | null;
  games: MultiplayerGameSummary[];
  loadingGames: boolean;
  onRefreshGames: () => void;
  onEnterSandbox: () => void;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onCreateGame: (
    name: string,
    power: Power,
    isPrivate?: boolean,
    passcode?: string,
  ) => Promise<MultiplayerGameSummary | void>;
  onJoinOrEnterGame: (
    gameId: string,
    power: Power,
    passcode?: string,
  ) => Promise<void>;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  user,
  games,
  loadingGames,
  onRefreshGames,
  onEnterSandbox,
  onOpenAuth,
  onCreateGame,
  onJoinOrEnterGame,
  onOpenSurrenderModal,
}) => {
  // Host and Join with code open as dialogs from the action row; one at a time.
  const [openDialog, setOpenDialog] = useState<'host' | 'join' | null>(null);
  const closeDialog = () => setOpenDialog(null);
  const host = useHostGameForm({
    user,
    onOpenAuth,
    onCreateGame,
    onDone: closeDialog,
  });
  const join = useJoinWithCodeForm({
    user,
    onOpenAuth,
    onJoinOrEnterGame,
    onDone: closeDialog,
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldId ? null : prev));
    }, 2500);
  };

  // The user's active games (including unwitnessed & <24h grace); public games are in the browser
  const myGames = user
    ? games.filter(
        (g) =>
          Object.values(g.participants || {}).some(
            (p) => p.user_id === user.id,
          ) && isVisibleInMyActiveCampaigns(g, user),
      )
    : [];

  const handlePowerSlotClick = async (
    game: MultiplayerGameSummary,
    power: Power,
  ) => {
    if (!user) {
      onOpenAuth(
        `Sign in or create an account to claim ${POWER_METADATA[power].shortName} in "${game.name}".`,
        'signin',
      );
      return;
    }

    // Every game reaching here holds the player's seat, so no passcode is asked for.
    try {
      await onJoinOrEnterGame(game.game_id, power);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.lobbyContainer}>
      <LobbyHero
        user={user}
        onEnterSandbox={onEnterSandbox}
        onOpenAuth={onOpenAuth}
      />

      <div className={styles.lobbyMainGrid} data-testid="lobby-main-grid">
        {/* Host and Join buttons, then My Games + Open Lobbies */}
        <div
          className={styles.lobbyGamesColumn}
          data-testid="lobby-games-column"
        >
          <LobbyActionRow
            onHostGame={() => {
              host.clearError();
              setOpenDialog('host');
            }}
            onJoinWithCode={() => {
              join.clearError();
              setOpenDialog('join');
            }}
          />
          <MyGamesSection
            user={user}
            myGames={myGames}
            handlePowerSlotClick={handlePowerSlotClick}
            onOpenAuth={onOpenAuth}
            onOpenSurrenderModal={onOpenSurrenderModal}
          />

          <GameBrowser
            user={user}
            myGames={myGames}
            refreshSignal={games}
            loadingGames={loadingGames}
            onRefreshGames={onRefreshGames}
            onOpenAuth={onOpenAuth}
            onJoinOrEnterGame={onJoinOrEnterGame}
          />
        </div>
      </div>

      {/* FOOTER BAR */}
      <footer className={styles.lobbyFooterBar} data-testid="lobby-footer">
        <span className={styles.lobbyFooterTagline}>
          Sloplomacy &bull; 1901 Tactical Engine
        </span>
        <VersionBadge />
      </footer>

      {openDialog === 'host' && (
        <LobbyFormDialog
          label="Host game"
          testId="host-game-dialog"
          onClose={closeDialog}
        >
          <CreateCampaignPanel user={user} {...host.panel} />
        </LobbyFormDialog>
      )}
      {openDialog === 'join' && (
        <LobbyFormDialog
          label="Join with code"
          testId="join-with-code-dialog"
          onClose={closeDialog}
        >
          <JoinWithCodeCard user={user} {...join.card} />
        </LobbyFormDialog>
      )}

      {/* CONFIRMATION MODAL: PRIVATE CAMPAIGN CREATED */}
      <PrivateCampaignCreatedModal
        createdPrivateModal={host.createdPrivate}
        onClose={host.closeCreatedPrivate}
        handleCopy={handleCopy}
        copiedGameId={copiedField === 'gid'}
        copiedPasscode={copiedField === 'pw'}
      />
    </div>
  );
};
