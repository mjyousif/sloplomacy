import type React from 'react';
import { useEffect, useState } from 'react';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import type { PasscodeRequest } from '../hooks/useGameRoute';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { filterAndSortMyGames, pickHeroGame } from '../utils/heroGame';
import { VersionBadge } from './header/VersionBadge';
import styles from './LobbyView.module.css';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { FeaturedGameHero } from './lobby/FeaturedGameHero';
import { GameBrowser } from './lobby/GameBrowser';
import { useHostGameForm } from './lobby/hooks/useHostGameForm';
import { useJoinWithCodeForm } from './lobby/hooks/useJoinWithCodeForm';
import { JoinWithCodeCard } from './lobby/JoinWithCodeCard';
import { LobbyActionRow } from './lobby/LobbyActionRow';
import { LobbyFormDialog } from './lobby/LobbyFormDialog';
import { LobbyHero } from './lobby/LobbyHero';
import { MyGamesSection } from './lobby/MyGamesSection';
import { OtherGamesStrip } from './lobby/OtherGamesStrip';
import {
  type CopyField,
  PrivateCampaignCreatedModal,
} from './lobby/PrivateCampaignCreatedModal';

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
  /** Opens a match to watch without a seat; rejects (after a toast) when it cannot be. */
  onWatchGame: (gameId: string, passcode?: string) => Promise<void>;
  /** A private match's link opened with no passcode: Join with code opens to ask for it. */
  passcodeRequest?: PasscodeRequest | null;
  onPasscodeRequestShown?: () => void;
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
  onWatchGame,
  passcodeRequest = null,
  onPasscodeRequestShown,
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
    onWatchGame,
    onDone: closeDialog,
  });
  const {
    copied: copiedField,
    failed: failedCopyField,
    copy: handleCopy,
  } = useCopyFeedback();

  // Join with code, with the Game ID from the link filled in.
  useEffect(() => {
    if (!passcodeRequest) return;
    join.prefill(passcodeRequest.gameId);
    setOpenDialog('join');
    onPasscodeRequestShown?.();
  }, [passcodeRequest]);

  // The user's active games (including unwitnessed & <24h grace); public games are in the browser
  const myGames = filterAndSortMyGames(games, user);
  // The game that most needs the player takes the top of the page; the rest sit in the strip.
  const heroGame = pickHeroGame(myGames, user);
  const otherGames = myGames.filter((g) => g !== heroGame);

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
      {user && heroGame ? (
        <FeaturedGameHero
          user={user}
          game={heroGame}
          onEnterGame={handlePowerSlotClick}
          onOpenSurrenderModal={onOpenSurrenderModal}
        />
      ) : (
        <LobbyHero
          user={user}
          onEnterSandbox={onEnterSandbox}
          onOpenAuth={onOpenAuth}
        />
      )}

      <div className={styles.lobbyMainGrid} data-testid="lobby-main-grid">
        {/* The player's other games, the Host and Join buttons, then the public game browser */}
        <div
          className={styles.lobbyGamesColumn}
          data-testid="lobby-games-column"
        >
          {user && myGames.length > 0 ? (
            <OtherGamesStrip
              user={user}
              games={otherGames}
              onEnterGame={handlePowerSlotClick}
              onOpenSurrenderModal={onOpenSurrenderModal}
              onEnterSandbox={onEnterSandbox}
            />
          ) : (
            <MyGamesSection user={user} onOpenAuth={onOpenAuth} />
          )}
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

          <GameBrowser
            user={user}
            myGames={myGames}
            refreshSignal={games}
            loadingGames={loadingGames}
            onRefreshGames={onRefreshGames}
            onOpenAuth={onOpenAuth}
            onJoinOrEnterGame={onJoinOrEnterGame}
            onWatchGame={onWatchGame}
          />
        </div>
      </div>

      {/* FOOTER BAR */}
      <footer className={styles.lobbyFooterBar} data-testid="lobby-footer">
        <div className={styles.lobbyFooterCopy}>
          <span className={styles.lobbyFooterTagline}>
            Traitorous &bull; 1901 Tactical Engine
          </span>
          <span className={styles.lobbyFooterDisclaimer}>
            Independent fan project. Not affiliated with Hasbro, Inc. or
            Renegade Game Studios.
          </span>
        </div>
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
        copiedLink={copiedField === 'link'}
        copiedPasscode={copiedField === 'pw'}
        copyFailed={failedCopyField as CopyField | null}
      />
    </div>
  );
};
