import { Flag, Lock, Play, Shield } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { getCompletedCampaignStatus } from '../../utils/gameOverHelpers';
import { PowerFlag } from '../PowerFlag';

export interface MyGamesSectionProps {
  user: AuthUser | null;
  /** The games the signed-in player holds a seat in. */
  myGames: MultiplayerGameSummary[];
  /** Where the Host form sits: "below" on a phone, "on the right" otherwise. */
  hostFormPlace: string;
  handlePowerSlotClick: (
    game: MultiplayerGameSummary,
    power: Power,
  ) => Promise<void>;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
}

/** The player's own campaigns and saved sandboxes, with Resume and Leave on each. */
export const MyGamesSection: React.FC<MyGamesSectionProps> = ({
  user,
  myGames,
  hostFormPlace,
  handlePowerSlotClick,
  onOpenAuth,
  onOpenSurrenderModal,
}) => {
  return (
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
            const isFinalized =
              game.finalized_powers?.includes(myPower) ?? false;
            const completion = getCompletedCampaignStatus(game, user);
            const isConcluded = completion.phase !== 'active';

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
                        isConcluded
                          ? completion.phase === 'unwitnessed'
                            ? 'pending'
                            : 'ready'
                          : isFinalized
                            ? 'ready'
                            : 'pending'
                      }`}
                    >
                      {isConcluded
                        ? completion.phase === 'unwitnessed'
                          ? '● Campaign Concluded — Awaiting Review'
                          : `✓ Completed · Archiving in ${completion.hoursRemaining}h`
                        : isFinalized
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
                    <span>
                      {isConcluded
                        ? 'Review Board'
                        : `Resume as ${pMeta.shortName}`}
                    </span>
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
};
