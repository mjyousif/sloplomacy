import React, { useState } from 'react';
import {
  ALL_POWERS,
  AuthUser,
  MultiplayerGameSummary,
  POWER_METADATA,
  Power,
} from '../types/diplomacy';
import {
  Compass,
  Crown,
  Flag,
  FlaskConical,
  Globe,
  Lock,
  LogIn,
  LogOut,
  Play,
  PlusCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';

interface LobbyViewProps {
  user: AuthUser | null;
  games: MultiplayerGameSummary[];
  loadingGames: boolean;
  onRefreshGames: () => void;
  onEnterSandbox: () => void;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onCreateGame: (name: string, power: Power) => Promise<void>;
  onJoinOrEnterGame: (gameId: string, power: Power) => Promise<void>;
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
  const [newGameName, setNewGameName] = useState('');
  const [selectedCreatePower, setSelectedCreatePower] =
    useState<Power>('FRANCE');
  const [creating, setCreating] = useState(false);
  const [joiningKey, setJoiningKey] = useState<string | null>(null);

  // Separate games into user's active games vs all multiplayer lobbies
  const myGames = user
    ? games.filter((g) =>
        Object.values(g.participants || {}).some((p) => p.user_id === user.id)
      )
    : [];

  const multiplayerLobbies = games.filter((g) => !g.is_sandbox);

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth(
        'Sign in or create an account to host a new multiplayer Diplomacy campaign.',
        'signup'
      );
      return;
    }
    setCreating(true);
    try {
      await onCreateGame(
        newGameName.trim() || `${user.displayName}'s 1901 Campaign`,
        selectedCreatePower
      );
      setNewGameName('');
    } finally {
      setCreating(false);
    }
  };

  const handlePowerSlotClick = async (
    game: MultiplayerGameSummary,
    power: Power
  ) => {
    if (!user) {
      onOpenAuth(
        `Sign in or create an account to claim ${POWER_METADATA[power].shortName} in "${game.name}".`,
        'signin'
      );
      return;
    }
    const key = `${game.game_id}_${power}`;
    setJoiningKey(key);
    try {
      await onJoinOrEnterGame(game.game_id, power);
    } finally {
      setJoiningKey(null);
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
          <h1 className="lobby-hero-title">
            The Chancellery of Europe
          </h1>
          <p className="lobby-hero-subtitle">
            {user ? (
              <>
                Welcome back, Envoy <strong>{user.displayName}</strong>. Command
                your nation in power-locked multiplayer campaigns, or open the
                unconstrained tactical sandbox to test multi-power maneuvers.
              </>
            ) : (
              <>
                Experiment freely with the full 7-power tactical engine in{' '}
                <strong>Guest Sandbox Mode</strong>—or sign in to claim your own
                nation, save scenarios, and wage multiplayer campaigns.
              </>
            )}
          </p>

          <div className="lobby-hero-actions">
            <button
              type="button"
              className="lobby-primary-cta"
              onClick={onEnterSandbox}
            >
              <FlaskConical size={18} />
              <span>
                {user
                  ? 'Launch Solo Tactical Sandbox'
                  : 'Launch Tactical Engine (Guest Sandbox)'}
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
              <span>Tactical Sandbox (Guest or Solo)</span>
            </div>
            <ul>
              <li>Switch freely between all 7 Great Powers</li>
              <li>Simulate bounces, supports & convoy chains</li>
              <li>Real-time tactical blunder warnings</li>
            </ul>
          </div>
          <div className="mode-card mp-card">
            <div className="mode-card-header">
              <Crown size={16} />
              <span>Multiplayer Campaign (Account Required)</span>
            </div>
            <ul>
              <li>Pick & lock in your single sovereign nation</li>
              <li>Issue & finalize orders strictly for your power</li>
              <li>Save games & track multi-turn war history</li>
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
                <h2>My Active Campaigns & Saved Games</h2>
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
                  <strong>Account Required to Save & Track Campaigns</strong>
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
                  You haven&apos;t joined any campaigns yet. Claim an open power
                  in the lobbies below or host a new match!
                </p>
              </div>
            ) : (
              <div className="my-games-list">
                {myGames.map((game) => {
                  const myEntry = Object.values(game.participants || {}).find(
                    (p) => p.user_id === user.id
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
                          onClick={() =>
                            handlePowerSlotClick(game, myPower)
                          }
                        >
                          <Play size={14} />
                          <span>Resume as {pMeta.shortName}</span>
                        </button>
                        <button
                          type="button"
                          className="leave-campaign-btn"
                          title={
                            game.is_sandbox
                              ? 'Delete saved tactical sandbox study'
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
              {multiplayerLobbies.map((game) => {
                const participants = game.participants || {};
                const claimedCount = Object.keys(participants).length;
                const myExistingClaim = user
                  ? Object.values(participants).find(
                      (p) => p.user_id === user.id
                    )
                  : undefined;

                return (
                  <div key={game.game_id} className="lobby-game-card">
                    <div className="lobby-game-card-header">
                      <div>
                        <h3 className="lobby-game-title">{game.name}</h3>
                        <span className="lobby-game-meta">
                          {game.season} {game.year} ({game.phase}) · Hosted by{' '}
                          {game.created_by}
                        </span>
                      </div>
                      <div className="lobby-game-badges">
                        <span className="players-count-pill">
                          <Users size={13} /> {claimedCount} / 7 Powers Claimed
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
                              {POWER_METADATA[myExistingClaim.power].shortName}
                            </strong>{' '}
                            in this campaign. Click your country below to enter, or
                            select an unclaimed nation to switch.
                          </span>
                          <button
                            type="button"
                            className="lobby-claim-leave-btn"
                            title="Surrender command and leave this match"
                            onClick={() =>
                              onOpenSurrenderModal(game, myExistingClaim.power)
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
                          Select an available Great Power below to claim it and
                          enter the match:
                        </span>
                      )}
                    </div>

                    <div className="lobby-power-slots-grid">
                      {ALL_POWERS.map((pwr) => {
                        const meta = POWER_METADATA[pwr];
                        const occupant = participants[pwr];
                        const isMine =
                          Boolean(user) && occupant?.user_id === user?.id;
                        const isTakenByOther =
                          Boolean(occupant) && !isMine;
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
                                  + Claim {meta.shortName}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Host New Multiplayer Campaign */}
        <aside className="lobby-create-column">
          <div className="lobby-create-card">
            <div className="lobby-create-header">
              <PlusCircle size={18} />
              <h3>Host New Multiplayer Game</h3>
            </div>
            <p className="lobby-create-desc">
              Create a new 1901 European theater and lock in your starting
              Great Power. Other players can join the remaining 6 countries from
              the lobby.
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
                          backgroundColor: selected
                            ? meta.lightBg
                            : undefined,
                        }}
                      >
                        <span>{meta.crest}</span>
                        <span>{meta.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

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
                    ? `Create & Play as ${POWER_METADATA[selectedCreatePower].shortName}`
                    : 'Sign In to Host Campaign'}
                </span>
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};
