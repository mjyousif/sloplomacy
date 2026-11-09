import {
  Compass,
  Crown,
  Flag,
  FlaskConical,
  Globe,
  Lock,
  LogIn,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react';
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
import { PowerFlag } from './PowerFlag';
import { CreateCampaignPanel } from './lobby/CreateCampaignPanel';
import { GameRoomCard } from './lobby/GameRoomCard';
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
  const [_passcodeModalSubmitting, setPasscodeModalSubmitting] =
    useState(false);
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
    setPasscodeModalSubmitting(true);
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
    } finally {
      setPasscodeModalSubmitting(false);
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
          {/* My Active Games Section */}
          <section className="lobby-section">
            <div className="lobby-section-header">
              <div className="lobby-section-title">
                <Shield size={18} />
                <h2>My Active Campaigns &amp; Saved Games</h2>
              </div>
              {user && (
                <span className="lobby-count-badge">
                  {myGames.length} {myGames.length === 1 ? 'Game' : 'Games'}
                </span>
              )}
            </div>

            {!user ? (
              <div className="lobby-empty-box locked">
                <Lock size={22} />
                <div>
                  <strong>
                    Account Required to Save &amp; Track Campaigns
                  </strong>
                  <p>
                    Sign in to see your active multiplayer nations and saved
                    tactical studies here.
                  </p>
                </div>
                <button
                  type="button"
                  className="lobby-inline-auth-btn"
                  onClick={() => onOpenAuth(undefined, 'signin')}
                >
                  Sign In
                </button>
              </div>
            ) : myGames.length === 0 ? (
              <div className="lobby-empty-box">
                <p>
                  You haven&apos;t joined any campaigns yet. Host a public or
                  private campaign {hostFormPlace}, or join using a Game ID
                  &amp; passcode!
                </p>
              </div>
            ) : (
              <div className="my-games-list">
                {myGames.map((game) => {
                  const myEntry = Object.values(game.participants || {}).find(
                    (p) => p.user_id === user.id,
                  );
                  const myPower = myEntry?.power || 'FRANCE';
                  const pMeta = POWER_METADATA[myPower];
                  const isFinalized =
                    game.finalized_powers?.includes(myPower) ?? false;

                  return (
                    <div key={game.game_id} className="my-game-row">
                      <div className="my-game-info">
                        <div className="my-game-top">
                          <span className="my-game-name">{game.name}</span>
                          <span className="my-game-turn-pill">
                            {game.season} {game.year} · {game.phase}
                          </span>
                          {game.is_private && (
                            <span className="my-game-private-tag">
                              <Lock size={11} /> Private
                            </span>
                          )}
                          {game.is_sandbox && (
                            <span className="my-game-sandbox-tag">
                              Saved Sandbox
                            </span>
                          )}
                        </div>
                        <div className="my-game-sub">
                          <span
                            className="my-power-chip"
                            style={{
                              backgroundColor: pMeta.lightBg,
                              borderColor: pMeta.color,
                              color: pMeta.color,
                            }}
                          >
                            <PowerFlag
                              power={myPower}
                              width={18}
                              height={12}
                              style={{ marginRight: 6 }}
                            />
                            Playing as {pMeta.shortName} (Locked)
                          </span>
                          <span
                            className={`my-finalize-status ${
                              isFinalized ? 'ready' : 'pending'
                            }`}
                          >
                            {isFinalized
                              ? '✓ Orders Finalized'
                              : '● Orders Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="my-game-action-group">
                        <button
                          type="button"
                          className="enter-match-btn"
                          onClick={() => handlePowerSlotClick(game, myPower)}
                        >
                          <Play size={14} />
                          <span>Resume as {pMeta.shortName}</span>
                        </button>
                        <button
                          type="button"
                          className="leave-campaign-btn"
                          title={
                            game.is_sandbox
                              ? 'Delete saved solo sandbox scenario'
                              : game.status === 'active'
                                ? `Surrender & leave ${game.name}`
                                : `Leave ${game.name} lobby`
                          }
                          onClick={() => onOpenSurrenderModal(game, myPower)}
                        >
                          <Flag size={13} />
                          <span>
                            {game.is_sandbox
                              ? 'Delete'
                              : game.status === 'active'
                                ? 'Surrender & Leave'
                                : 'Leave'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Open Multiplayer Lobbies Section */}
          <section className="lobby-section">
            <div className="lobby-section-header">
              <div className="lobby-section-title">
                <Globe size={18} />
                <h2>Multiplayer Lobbies — Pick Your Country</h2>
              </div>
              <button
                type="button"
                className="lobby-refresh-btn"
                onClick={onRefreshGames}
                disabled={loadingGames}
              >
                <RefreshCw
                  size={14}
                  className={loadingGames ? 'spin-icon' : ''}
                />
                <span>Refresh</span>
              </button>
            </div>

            <div className="lobby-cards-stack">
              {multiplayerLobbies.length === 0 ? (
                <div className="lobby-empty-box no-lobbies">
                  <Globe size={28} className="empty-globe-icon" />
                  <div>
                    <strong>No Active Campaigns Right Now</strong>
                    <p>
                      There are no active multiplayer lobbies yet. Host a new
                      public or private match {hostFormPlace}, or join a
                      friend&apos;s game using their Game ID and passcode!
                    </p>
                  </div>
                </div>
              ) : (
                multiplayerLobbies.map((game) => (
                  <GameRoomCard
                    key={game.game_id}
                    game={game}
                    user={user}
                    joiningKey={joiningKey}
                    onOpenSurrenderModal={onOpenSurrenderModal}
                    handlePowerSlotClick={handlePowerSlotClick}
                  />
                ))
              )}
            </div>
          </section>
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
