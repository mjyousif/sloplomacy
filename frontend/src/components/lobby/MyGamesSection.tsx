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
import sectionStyles from './LobbySection.module.css';
import styles from './MyGamesSection.module.css';

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
    <section className={sectionStyles.lobbySection}>
      <div className={sectionStyles.lobbySectionHeader}>
        <div className={sectionStyles.lobbySectionTitle}>
          <Shield size={18} />
          <h2>My Active Campaigns &amp; Saved Games</h2>
        </div>
        {user && (
          <span className={styles.lobbyCountBadge} data-testid="my-games-count">
            {myGames.length} {myGames.length === 1 ? 'Game' : 'Games'}
          </span>
        )}
      </div>

      {!user ? (
        <div className={sectionStyles.lobbyEmptyBox} data-variant="locked">
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
            className={styles.lobbyInlineAuthBtn}
            onClick={() => onOpenAuth(undefined, 'signin')}
          >
            Sign In
          </button>
        </div>
      ) : myGames.length === 0 ? (
        <div className={sectionStyles.lobbyEmptyBox}>
          <p>
            You haven&apos;t joined any campaigns yet. Host a public or private
            campaign {hostFormPlace}, or join using a Game ID &amp; passcode!
          </p>
        </div>
      ) : (
        <div className={styles.myGamesList}>
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
              <div
                key={game.game_id}
                className={styles.myGameRow}
                data-testid="my-game-row"
              >
                <div>
                  <div className={styles.myGameTop}>
                    <span
                      className={styles.myGameName}
                      data-testid="my-game-name"
                    >
                      {game.name}
                    </span>
                    <span className={styles.myGameTurnPill}>
                      {game.season} {game.year} · {game.phase}
                    </span>
                    {game.is_private && (
                      <span className={styles.myGamePrivateTag}>
                        <Lock size={11} /> Private
                      </span>
                    )}
                    {game.is_sandbox && (
                      <span className={styles.myGameSandboxTag}>
                        Saved Sandbox
                      </span>
                    )}
                  </div>
                  <div className={styles.myGameSub}>
                    <span
                      className={styles.myPowerChip}
                      data-testid="my-power-chip"
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
                      data-status={
                        isConcluded
                          ? completion.phase === 'unwitnessed'
                            ? 'pending'
                            : 'ready'
                          : isFinalized
                            ? 'ready'
                            : 'pending'
                      }
                      className={styles.myFinalizeStatus}
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

                <div className={styles.myGameActionGroup}>
                  <button
                    type="button"
                    className={styles.enterMatchBtn}
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
                    className={styles.leaveCampaignBtn}
                    data-testid="leave-campaign-btn"
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
