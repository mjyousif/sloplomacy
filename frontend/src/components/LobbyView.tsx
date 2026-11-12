import type React from 'react';
import { useState } from 'react';
import { useCompactLayout } from '../hooks/useCompactLayout';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { defaultCampaignName } from '../utils/campaignName';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { JoinWithCodeCard } from './lobby/JoinWithCodeCard';
import { LobbyHero } from './lobby/LobbyHero';
import { MyGamesSection } from './lobby/MyGamesSection';
import { OpenLobbiesSection } from './lobby/OpenLobbiesSection';
import { PasscodePromptModal } from './lobby/PasscodePromptModal';
import { PrivateCampaignCreatedModal } from './lobby/PrivateCampaignCreatedModal';
import { VersionBadge } from './VersionBadge';

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
  // On a phone the Host and Join forms sit below the game lists instead of beside them.
  const hostFormPlace = useCompactLayout() ? 'below' : 'on the right';

  // Host game form state
  const [newGameName, setNewGameName] = useState('');
  const [selectedCreatePower, setSelectedCreatePower] =
    useState<Power>('FRANCE');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [passcode, setPasscode] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal for newly created private campaign
  const [createdPrivateModal, setCreatedPrivateModal] = useState<{
    gameId: string;
    name: string;
    passcode: string;
    power: Power;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Join by Game ID & Passcode form state
  const [joinCodeGameId, setJoinCodeGameId] = useState('');
  const [joinCodePasscode, setJoinCodePasscode] = useState('');
  const [joinCodePower, setJoinCodePower] = useState<Power>('ENGLAND');
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

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

  // Separate games into user's active games vs all multiplayer lobbies
  const myGames = user
    ? games.filter((g) =>
        Object.values(g.participants || {}).some((p) => p.user_id === user.id),
      )
    : [];

  const multiplayerLobbies = games.filter((g) => !g.is_sandbox);

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth(
        'Sign in or create an account to host a new multiplayer Diplomacy campaign.',
        'signup',
      );
      return;
    }
    if (isPrivate && !passcode.trim()) {
      setCreateError('Please specify a passcode for your private campaign.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const summary = await onCreateGame(
        newGameName.trim() || defaultCampaignName(user.displayName),
        selectedCreatePower,
        isPrivate,
        passcode.trim(),
      );
      if (isPrivate && summary && passcode.trim()) {
        setCreatedPrivateModal({
          gameId: summary.game_id,
          name: summary.name,
          passcode: passcode.trim(),
          power: selectedCreatePower,
        });
      }
      setNewGameName('');
      setPasscode('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

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

  const handleJoinCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth('Sign in or create an account to join a campaign.', 'signin');
      return;
    }
    const cleanId = joinCodeGameId.trim();
    if (!cleanId) return;

    setJoinCodeLoading(true);
    setJoinCodeError(null);
    try {
      await onJoinOrEnterGame(cleanId, joinCodePower, joinCodePasscode.trim());
      setJoinCodeGameId('');
      setJoinCodePasscode('');
    } catch (err: any) {
      setJoinCodeError(
        err.message ||
          'Could not join campaign. Please verify Game ID and passcode.',
      );
    } finally {
      setJoinCodeLoading(false);
    }
  };

  return (
    <div className="lobby-container">
      <LobbyHero
        user={user}
        onEnterSandbox={onEnterSandbox}
        onOpenAuth={onOpenAuth}
      />

      <div className="lobby-main-grid">
        {/* Left Column: My Games + Open Lobbies */}
        <div className="lobby-games-column">
          <MyGamesSection
            user={user}
            myGames={myGames}
            hostFormPlace={hostFormPlace}
            handlePowerSlotClick={handlePowerSlotClick}
            onOpenAuth={onOpenAuth}
            onOpenSurrenderModal={onOpenSurrenderModal}
          />

          <OpenLobbiesSection
            user={user}
            multiplayerLobbies={multiplayerLobbies}
            loadingGames={loadingGames}
            onRefreshGames={onRefreshGames}
            hostFormPlace={hostFormPlace}
            joiningKey={joiningKey}
            handlePowerSlotClick={handlePowerSlotClick}
            onOpenSurrenderModal={onOpenSurrenderModal}
          />
        </div>

        {/* Right Column: Host New Multiplayer Campaign & Join with Code */}
        <aside className="lobby-create-column">
          {/* 1. Host New Campaign Card */}
          <CreateCampaignPanel
            user={user}
            newGameName={newGameName}
            setNewGameName={setNewGameName}
            isPrivate={isPrivate}
            setIsPrivate={setIsPrivate}
            passcode={passcode}
            setPasscode={setPasscode}
            selectedCreatePower={selectedCreatePower}
            setSelectedCreatePower={setSelectedCreatePower}
            createError={createError}
            creating={creating}
            handleCreateMatch={handleCreateMatch}
          />

          {/* 2. Join Private Campaign by Game ID & Passcode */}
          <JoinWithCodeCard
            user={user}
            joinCodeGameId={joinCodeGameId}
            setJoinCodeGameId={setJoinCodeGameId}
            joinCodePasscode={joinCodePasscode}
            setJoinCodePasscode={setJoinCodePasscode}
            joinCodePower={joinCodePower}
            setJoinCodePower={setJoinCodePower}
            joinCodeLoading={joinCodeLoading}
            joinCodeError={joinCodeError}
            handleJoinCodeSubmit={handleJoinCodeSubmit}
          />
        </aside>
      </div>

      {/* FOOTER BAR */}
      <footer className="lobby-footer-bar">
        <span className="lobby-footer-tagline">
          Sloplomacy &bull; 1901 Tactical Engine
        </span>
        <VersionBadge />
      </footer>

      {/* CONFIRMATION MODAL: PRIVATE CAMPAIGN CREATED */}
      <PrivateCampaignCreatedModal
        createdPrivateModal={createdPrivateModal}
        onClose={() => setCreatedPrivateModal(null)}
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
