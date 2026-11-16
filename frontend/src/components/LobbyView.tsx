import type React from 'react';
import { useState } from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { isVisibleInMyActiveCampaigns } from '../utils/gameOverHelpers';
import { pickHeroGame, sortMyGames } from '../utils/heroGame';
import { VersionBadge } from './header/VersionBadge';
import styles from './LobbyView.module.css';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { FeaturedGameHero } from './lobby/FeaturedGameHero';
import { useHostGameForm } from './lobby/hooks/useHostGameForm';
import { useJoinWithCodeForm } from './lobby/hooks/useJoinWithCodeForm';
import { JoinWithCodeCard } from './lobby/JoinWithCodeCard';
import { LobbyActionRow } from './lobby/LobbyActionRow';
import { LobbyFormDialog } from './lobby/LobbyFormDialog';
import { LobbyHero } from './lobby/LobbyHero';
import { MyGamesSection } from './lobby/MyGamesSection';
import { OpenLobbiesSection } from './lobby/OpenLobbiesSection';
import { OtherGamesStrip } from './lobby/OtherGamesStrip';
import { PasscodePromptModal } from './lobby/PasscodePromptModal';
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

  // Modal prompt when clicking a private game slot in the list
  const [passcodeModalTarget, setPasscodeModalTarget] = useState<{
    game: MultiplayerGameSummary;
    power: Power;
  } | null>(null);
  const [enteredModalPasscode, setEnteredModalPasscode] = useState('');
  const [passcodeModalError, setPasscodeModalError] = useState<string | null>(
    null,
  );

  const [joiningKey, setJoiningKey] = useState<string | null>(null);

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldId ? null : prev));
    }, 2500);
  };

  // Separate games into user's active games (including unwitnessed & <24h grace) vs open multiplayer lobbies
  const myGames = user
    ? sortMyGames(
        games.filter(
          (g) =>
            Object.values(g.participants || {}).some(
              (p) => p.user_id === user.id,
            ) && isVisibleInMyActiveCampaigns(g, user),
        ),
        user,
      )
    : [];
  // The game that most needs the player takes the top of the page; the rest sit in the strip.
  const heroGame = pickHeroGame(myGames, user);
  const otherGames = myGames.filter((g) => g !== heroGame);

  const multiplayerLobbies = games.filter(
    (g) => !g.is_sandbox && g.status !== 'completed' && !g.winner,
  );

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

    const isAlreadyClaimedByMe =
      game.participants && game.participants[power]?.user_id === user.id;
    const isAlreadyInThisGame = Boolean(
      user &&
        Object.values(game.participants || {}).some(
          (p) => p.user_id === user.id,
        ),
    );

    // If private with passcode and user isn't already a participant, ask for passcode!
    if (game.has_passcode && !isAlreadyClaimedByMe && !isAlreadyInThisGame) {
      setPasscodeModalTarget({ game, power });
      setEnteredModalPasscode('');
      setPasscodeModalError(null);
      return;
    }

    const key = `${game.game_id}_${power}`;
    setJoiningKey(key);
    try {
      await onJoinOrEnterGame(game.game_id, power);
    } catch (err) {
      console.error(err);
    } finally {
      setJoiningKey(null);
    }
  };

  const handlePasscodeModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeModalTarget) return;
    setPasscodeModalError(null);
    try {
      await onJoinOrEnterGame(
        passcodeModalTarget.game.game_id,
        passcodeModalTarget.power,
        enteredModalPasscode.trim(),
      );
      setPasscodeModalTarget(null);
    } catch (err: any) {
      setPasscodeModalError(
        err.message || 'Incorrect passcode for this private campaign.',
      );
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
        {/* The player's other games, the Host and Join buttons, then Open Lobbies */}
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

          <OpenLobbiesSection
            user={user}
            multiplayerLobbies={multiplayerLobbies}
            loadingGames={loadingGames}
            onRefreshGames={onRefreshGames}
            joiningKey={joiningKey}
            handlePowerSlotClick={handlePowerSlotClick}
            onOpenSurrenderModal={onOpenSurrenderModal}
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

      <PasscodePromptModal
        passcodeModalTarget={passcodeModalTarget}
        onClose={() => setPasscodeModalTarget(null)}
        enteredModalPasscode={enteredModalPasscode}
        setEnteredModalPasscode={setEnteredModalPasscode}
        passcodeModalError={passcodeModalError}
        handlePasscodeModalSubmit={handlePasscodeModalSubmit}
        joiningKey={joiningKey}
      />
    </div>
  );
};
