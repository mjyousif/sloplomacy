import { Compass, Crown, FlaskConical, LogIn, Sparkles } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useCompactLayout } from '../hooks/useCompactLayout';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../types/diplomacy';
import { defaultCampaignName } from '../utils/campaignName';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { GameBrowser } from './lobby/GameBrowser';
import { MyGamesSection } from './lobby/MyGamesSection';
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
      {/* Top Hero Banner */}
      <section className="lobby-hero">
        <div className="lobby-hero-content">
          <div className="lobby-badge-row">
            <span className="lobby-era-pill">
              <Compass size={13} /> STANDARD 1901 DIPLOMACY
            </span>
            <span className="lobby-era-pill gold">
              <Sparkles size={13} /> DATC ADJUDICATOR
            </span>
          </div>
          <h1 className="lobby-hero-title">The Chancellery of Europe</h1>
          <p className="lobby-hero-subtitle">
            {user ? (
              <>
                Welcome back, Envoy <strong>{user.displayName}</strong>. Command
                your nation in power-locked multiplayer campaigns, or open the
                solo sandbox with automated General Staff AI to test multi-power
                maneuvers.
              </>
            ) : (
              <>
                Experiment freely with the full 7-power tactical engine in{' '}
                <strong>Guest Solo Sandbox</strong>—now powered with intelligent
                tactical AI—or sign in to claim your own nation, save scenarios,
                and wage multiplayer campaigns.
              </>
            )}
          </p>

          <div className="lobby-hero-actions">
            <button
              type="button"
              data-testid="btn-enter-sandbox"
              className="lobby-primary-cta"
              onClick={onEnterSandbox}
            >
              <FlaskConical size={18} />
              <span>
                {user ? 'Launch Solo Sandbox' : 'Launch Solo Sandbox (Guest)'}
              </span>
            </button>

            {!user && (
              <button
                type="button"
                className="lobby-secondary-cta"
                onClick={() => onOpenAuth(undefined, 'signin')}
              >
                <LogIn size={17} />
                <span>Sign In / Create Account for Multiplayer</span>
              </button>
            )}
          </div>
        </div>

        {/* Feature Comparison Card */}
        <div className="lobby-mode-comparison">
          <div className="mode-card sandbox-card">
            <div className="mode-card-header">
              <FlaskConical size={16} />
              <span>Solo Sandbox (Guest or Practice)</span>
            </div>
            <ul>
              <li>Switch freely between all 7 Great Powers</li>
              <li>Tactical AI auto-plans opponent moves &amp; steps turns</li>
              <li>Simulate bounces, supports &amp; convoy chains</li>
            </ul>
          </div>
          <div className="mode-card mp-card">
            <div className="mode-card-header">
              <Crown size={16} />
              <span>Multiplayer Campaigns (Public &amp; Private)</span>
            </div>
            <ul>
              <li>Host public or passcode-protected private campaigns</li>
              <li>Invite players via Game ID &amp; secret passcode</li>
              <li>Issue &amp; finalize orders strictly for your nation</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="lobby-main-grid">
        {/* Left Column: My Games + Open Lobbies */}
        <div className="lobby-games-column">
          <MyGamesSection
            user={user}
            myGames={myGames}
            hostFormPlace={hostFormPlace}
            onOpenAuth={onOpenAuth}
            onResume={(game, power) => onJoinOrEnterGame(game.game_id, power)}
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
            hostFormPlace={hostFormPlace}
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
    </div>
  );
};
