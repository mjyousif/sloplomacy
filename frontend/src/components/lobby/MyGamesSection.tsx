import { Flag, Lock, Play, Shield } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { PowerFlag } from '../PowerFlag';

export interface MyGamesSectionProps {
  user: AuthUser | null;
  /** Games the player holds a seat in, private campaigns and saved sandboxes included. */
  myGames: MultiplayerGameSummary[];
  /** Where the Host form is: "on the right" or "below". */
  hostFormPlace: string;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onResume: (game: MultiplayerGameSummary, power: Power) => void;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
}

/** The player's own campaigns and saved sandboxes, each with Resume and Leave. */
export const MyGamesSection: React.FC<MyGamesSectionProps> = ({
  user,
  myGames,
  hostFormPlace,
  onOpenAuth,
  onResume,
  onOpenSurrenderModal,
}) => (
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
          <strong>Account Required to Save &amp; Track Campaigns</strong>
          <p>
            Sign in to see your active multiplayer nations and saved tactical
            studies here.
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
          You haven&apos;t joined any campaigns yet. Host a public or private
          campaign {hostFormPlace}, or join using a Game ID &amp; passcode!
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
          const isFinalized = game.finalized_powers?.includes(myPower) ?? false;

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
                    <span className="my-game-sandbox-tag">Saved Sandbox</span>
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
                    {isFinalized ? '✓ Orders Finalized' : '● Orders Pending'}
                  </span>
                </div>
              </div>

              <div className="my-game-action-group">
                <button
                  type="button"
                  className="enter-match-btn"
                  onClick={() => onResume(game, myPower)}
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
);
