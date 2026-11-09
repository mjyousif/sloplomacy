import {
  AlertTriangle,
  Check,
  Compass,
  Copy,
  Crown,
  Flag,
  FlaskConical,
  Globe,
  KeyRound,
  Lock,
  LogIn,
  Play,
  PlusCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useCompactLayout } from '../hooks/useCompactLayout';
import {
  ALL_POWERS,
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
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
  const [passcodeModalSubmitting, setPasscodeModalSubmitting] = useState(false);
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
        newGameName.trim() || `${user.displayName}'s 1901 Campaign`,
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
                            {pMeta.crest} Playing as {pMeta.shortName} (Locked)
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
                multiplayerLobbies.map((game) => {
                  const participants = game.participants || {};
                  const claimedCount = Object.keys(participants).length;
                  const myExistingClaim = user
                    ? Object.values(participants).find(
                        (p) => p.user_id === user.id,
                      )
                    : undefined;

                  return (
                    <div key={game.game_id} className="lobby-game-card">
                      <div className="lobby-game-card-header">
                        <div>
                          <div className="lobby-game-title-row">
                            <h3 className="lobby-game-title">{game.name}</h3>
                            {game.is_private && (
                              <span
                                className="game-status-pill private"
                                title="Private lobby protected by passcode"
                              >
                                <Lock size={11} /> Private
                              </span>
                            )}
                          </div>
                          <span className="lobby-game-meta">
                            {game.season} {game.year} ({game.phase}) · Hosted by{' '}
                            {game.created_by} ·{' '}
                            <span className="game-id-mono">
                              ID: {game.game_id}
                            </span>
                          </span>
                        </div>
                        <div className="lobby-game-badges">
                          <span className="players-count-pill">
                            <Users size={13} /> {claimedCount} / 7 Powers
                            Claimed
                          </span>
                          <span
                            className={`game-status-pill ${
                              game.status === 'active' ? 'active' : 'waiting'
                            }`}
                          >
                            {game.status === 'active'
                              ? 'Active Match'
                              : 'Recruiting Envoys'}
                          </span>
                        </div>
                      </div>

                      <div className="lobby-powers-instruction">
                        {myExistingClaim ? (
                          <div className="lobby-claim-alert-flex">
                            <span>
                              You are commanding{' '}
                              <strong>
                                {POWER_METADATA[myExistingClaim.power].crest}{' '}
                                {
                                  POWER_METADATA[myExistingClaim.power]
                                    .shortName
                                }
                              </strong>{' '}
                              in this campaign. Click your country below to
                              enter, or select an unclaimed nation to switch.
                            </span>
                            <button
                              type="button"
                              className="lobby-claim-leave-btn"
                              title="Surrender command and leave this match"
                              onClick={() =>
                                onOpenSurrenderModal(
                                  game,
                                  myExistingClaim.power,
                                )
                              }
                            >
                              <Flag size={12} />
                              <span>
                                {game.status === 'active'
                                  ? 'Surrender & Leave'
                                  : 'Leave Match'}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <span>
                            Select an available Great Power below to claim it
                            and enter the match
                            {game.has_passcode ? ' (Passcode Required)' : ''}:
                          </span>
                        )}
                      </div>

                      <div className="lobby-power-slots-grid">
                        {ALL_POWERS.map((pwr) => {
                          const meta = POWER_METADATA[pwr];
                          const occupant = participants[pwr];
                          const isMine =
                            Boolean(user) && occupant?.user_id === user?.id;
                          const isTakenByOther = Boolean(occupant) && !isMine;
                          const isBusy =
                            joiningKey === `${game.game_id}_${pwr}`;

                          return (
                            <button
                              key={pwr}
                              type="button"
                              disabled={isTakenByOther || isBusy}
                              onClick={() => handlePowerSlotClick(game, pwr)}
                              className={`power-slot-btn ${
                                isMine
                                  ? 'slot-mine'
                                  : isTakenByOther
                                    ? 'slot-taken'
                                    : 'slot-open'
                              }`}
                              style={{
                                borderColor: isMine
                                  ? meta.color
                                  : isTakenByOther
                                    ? 'rgba(0,0,0,0.12)'
                                    : meta.color,
                                backgroundColor: isMine
                                  ? meta.lightBg
                                  : undefined,
                              }}
                            >
                              <div className="power-slot-top">
                                <span className="power-slot-crest">
                                  {meta.crest}
                                </span>
                                <span
                                  className="power-slot-name"
                                  style={{
                                    color: isTakenByOther
                                      ? '#7a756c'
                                      : meta.color,
                                  }}
                                >
                                  {meta.shortName}
                                </span>
                              </div>
                              <div className="power-slot-status">
                                {isBusy ? (
                                  'Entering...'
                                ) : isMine ? (
                                  <span className="slot-yours-label">
                                    ★ Your Country (Enter)
                                  </span>
                                ) : isTakenByOther ? (
                                  <span className="slot-taken-label">
                                    🔒 {occupant.display_name}
                                  </span>
                                ) : (
                                  <span className="slot-claim-label">
                                    {game.has_passcode ? '🔒' : '+'} Claim{' '}
                                    {meta.shortName}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Host New Multiplayer Campaign & Join with Code */}
        <aside className="lobby-create-column">
          {/* 1. Host New Campaign Card */}
          <div className="lobby-create-card">
            <div className="lobby-create-header">
              <PlusCircle size={18} />
              <h3>Host New Multiplayer Game</h3>
            </div>
            <p className="lobby-create-desc">
              Create a new 1901 European theater as either a public match or a
              private campaign with a secret passcode.
            </p>

            <form onSubmit={handleCreateMatch} className="lobby-create-form">
              <div className="lobby-field">
                <label htmlFor="new-game-name">Campaign Name</label>
                <input
                  id="new-game-name"
                  type="text"
                  placeholder="e.g. Congress of Vienna #42"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                />
              </div>

              {/* Public vs Private Campaign Toggle */}
              <div className="lobby-field">
                <label>Campaign Access</label>
                <div className="privacy-toggle-row">
                  <button
                    type="button"
                    className={`privacy-toggle-btn ${!isPrivate ? 'active' : ''}`}
                    onClick={() => {
                      setIsPrivate(false);
                      setPasscode('');
                    }}
                  >
                    <Globe size={13} />
                    <span>Public Lobby</span>
                  </button>
                  <button
                    type="button"
                    className={`privacy-toggle-btn ${isPrivate ? 'active' : ''}`}
                    onClick={() => setIsPrivate(true)}
                  >
                    <Lock size={13} />
                    <span>Private (Passcode)</span>
                  </button>
                </div>
              </div>

              {isPrivate && (
                <div className="lobby-field">
                  <label htmlFor="private-passcode">
                    Campaign Passcode / PIN
                  </label>
                  <input
                    id="private-passcode"
                    type="text"
                    placeholder="Enter secret passcode (e.g. Vienna1901)"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    required={isPrivate}
                  />
                  <span className="field-hint">
                    Players will need to enter this passcode to join your
                    private campaign.
                  </span>
                </div>
              )}

              <div className="lobby-field">
                <label>Pick Your Sovereign Country</label>
                <div className="create-power-picker">
                  {ALL_POWERS.map((pwr) => {
                    const meta = POWER_METADATA[pwr];
                    const selected = selectedCreatePower === pwr;
                    return (
                      <button
                        key={pwr}
                        type="button"
                        onClick={() => setSelectedCreatePower(pwr)}
                        className={`create-power-option ${
                          selected ? 'selected' : ''
                        }`}
                        style={{
                          borderColor: selected ? meta.color : undefined,
                          backgroundColor: selected ? meta.lightBg : undefined,
                        }}
                      >
                        <span>{meta.crest}</span>
                        <span>{meta.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {createError && (
                <div className="lobby-error-alert">
                  <AlertTriangle size={14} />
                  <span>{createError}</span>
                </div>
              )}

              <button
                type="submit"
                className="lobby-create-submit-btn"
                disabled={creating}
              >
                <PlusCircle size={16} />
                <span>
                  {creating
                    ? 'Creating Campaign...'
                    : user
                      ? `Create ${isPrivate ? 'Private' : ''} & Play as ${POWER_METADATA[selectedCreatePower].shortName}`
                      : 'Sign In to Host Campaign'}
                </span>
              </button>
            </form>
          </div>

          {/* 2. Join Private Campaign by Game ID & Passcode */}
          <div
            className="lobby-create-card join-card"
            style={{ marginTop: '20px' }}
          >
            <div className="lobby-create-header">
              <KeyRound size={18} />
              <h3>Join Private Campaign</h3>
            </div>
            <p className="lobby-create-desc">
              Have a Game ID and passcode from a host? Enter them below to claim
              your nation and join the war room.
            </p>

            <form onSubmit={handleJoinCodeSubmit} className="lobby-create-form">
              <div className="lobby-field">
                <label htmlFor="join-code-id">Game ID</label>
                <input
                  id="join-code-id"
                  type="text"
                  placeholder="e.g. mp_3d8f2b"
                  value={joinCodeGameId}
                  onChange={(e) => setJoinCodeGameId(e.target.value)}
                  required
                />
              </div>

              <div className="lobby-field">
                <label htmlFor="join-code-passcode">Lobby Passcode</label>
                <input
                  id="join-code-passcode"
                  type="text"
                  placeholder="Enter lobby passcode"
                  value={joinCodePasscode}
                  onChange={(e) => setJoinCodePasscode(e.target.value)}
                />
              </div>

              <div className="lobby-field">
                <label>Nation to Claim</label>
                <div className="create-power-picker">
                  {ALL_POWERS.map((pwr) => {
                    const meta = POWER_METADATA[pwr];
                    const selected = joinCodePower === pwr;
                    return (
                      <button
                        key={pwr}
                        type="button"
                        onClick={() => setJoinCodePower(pwr)}
                        className={`create-power-option ${
                          selected ? 'selected' : ''
                        }`}
                        style={{
                          borderColor: selected ? meta.color : undefined,
                          backgroundColor: selected ? meta.lightBg : undefined,
                        }}
                      >
                        <span>{meta.crest}</span>
                        <span>{meta.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {joinCodeError && (
                <div className="lobby-error-alert">
                  <AlertTriangle size={14} />
                  <span>{joinCodeError}</span>
                </div>
              )}

              <button
                type="submit"
                className="lobby-join-submit-btn"
                disabled={joinCodeLoading || !joinCodeGameId.trim()}
              >
                <KeyRound size={15} />
                <span>
                  {joinCodeLoading
                    ? 'Verifying & Joining...'
                    : user
                      ? `Unlock & Claim ${POWER_METADATA[joinCodePower].shortName}`
                      : 'Sign In to Join Campaign'}
                </span>
              </button>
            </form>
          </div>
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
      {createdPrivateModal && (
        <div className="modal-backdrop">
          <div className="private-created-modal-card">
            <div className="created-modal-header">
              <div className="created-modal-title">
                <Lock size={18} />
                <h3>Private Campaign Created!</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCreatedPrivateModal(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="created-modal-desc">
              Your private campaign{' '}
              <strong>&ldquo;{createdPrivateModal.name}&rdquo;</strong> has been
              created. Share this <strong>Game ID</strong> and{' '}
              <strong>Passcode</strong> with other players so they can enter:
            </p>

            <div className="credential-box-wrap">
              <div className="credential-row">
                <span className="cred-label">Game ID:</span>
                <span className="cred-value">{createdPrivateModal.gameId}</span>
                <button
                  type="button"
                  className="cred-copy-btn"
                  onClick={() => handleCopy(createdPrivateModal.gameId, 'gid')}
                >
                  {copiedField === 'gid' ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>{copiedField === 'gid' ? 'Copied!' : 'Copy ID'}</span>
                </button>
              </div>

              <div className="credential-row">
                <span className="cred-label">Passcode:</span>
                <span className="cred-value highlight">
                  {createdPrivateModal.passcode}
                </span>
                <button
                  type="button"
                  className="cred-copy-btn"
                  onClick={() => handleCopy(createdPrivateModal.passcode, 'pw')}
                >
                  {copiedField === 'pw' ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>
                    {copiedField === 'pw' ? 'Copied!' : 'Copy Passcode'}
                  </span>
                </button>
              </div>
            </div>

            <div className="created-modal-actions">
              <button
                type="button"
                className="created-enter-btn"
                onClick={async () => {
                  const m = createdPrivateModal;
                  setCreatedPrivateModal(null);
                  await onJoinOrEnterGame(m.gameId, m.power, m.passcode);
                }}
              >
                <Play size={15} />
                <span>Enter Campaign War Room</span>
              </button>
              <button
                type="button"
                className="created-close-secondary-btn"
                onClick={() => setCreatedPrivateModal(null)}
              >
                Stay in Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSCODE MODAL: ENTERING PRIVATE GAME FROM LIST */}
      {passcodeModalTarget && (
        <div className="modal-backdrop">
          <div className="passcode-prompt-card">
            <div className="created-modal-header">
              <div className="created-modal-title">
                <Lock size={18} />
                <h3>Private Campaign Passcode</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPasscodeModalTarget(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="created-modal-desc">
              <strong>&ldquo;{passcodeModalTarget.game.name}&rdquo;</strong> is
              a private campaign. Enter the passcode set by the host to claim{' '}
              <strong>
                {POWER_METADATA[passcodeModalTarget.power].shortName}
              </strong>
              :
            </p>
            <form
              onSubmit={handlePasscodeModalSubmit}
              className="passcode-modal-form"
            >
              <div className="lobby-field">
                <label htmlFor="modal-passcode-input">Passcode</label>
                <input
                  id="modal-passcode-input"
                  type="text"
                  autoFocus
                  placeholder="Enter lobby passcode"
                  value={enteredModalPasscode}
                  onChange={(e) => setEnteredModalPasscode(e.target.value)}
                  required
                />
              </div>
              {passcodeModalError && (
                <div className="lobby-error-alert">
                  <AlertTriangle size={14} />
                  <span>{passcodeModalError}</span>
                </div>
              )}
              <div className="passcode-modal-actions">
                <button
                  type="submit"
                  className="created-enter-btn"
                  disabled={
                    passcodeModalSubmitting || !enteredModalPasscode.trim()
                  }
                >
                  <KeyRound size={14} />
                  <span>
                    {passcodeModalSubmitting
                      ? 'Verifying...'
                      : `Unlock & Claim ${POWER_METADATA[passcodeModalTarget.power].shortName}`}
                  </span>
                </button>
                <button
                  type="button"
                  className="created-close-secondary-btn"
                  onClick={() => setPasscodeModalTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
