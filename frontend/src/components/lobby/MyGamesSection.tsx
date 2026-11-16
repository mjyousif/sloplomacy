import { Lock, Shield } from 'lucide-react';
import type React from 'react';
import type { AuthUser } from '../../types/diplomacy';
import sectionStyles from './LobbySection.module.css';
import styles from './MyGamesSection.module.css';

export interface MyGamesSectionProps {
  user: AuthUser | null;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
}

/**
 * What stands where a player's games would be when there are none to show: a sign-in prompt
 * for a guest, a pointer at Host game for a player without games. A player with games gets
 * `FeaturedGameHero` and `OtherGamesStrip` instead.
 */
export const MyGamesSection: React.FC<MyGamesSectionProps> = ({
  user,
  onOpenAuth,
}) => {
  return (
    <section className={sectionStyles.lobbySection}>
      <div className={sectionStyles.lobbySectionHeader}>
        <div className={sectionStyles.lobbySectionTitle}>
          <Shield size={18} />
          <h2>My Active Campaigns &amp; Saved Games</h2>
        </div>
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
      ) : (
        <div className={sectionStyles.lobbyEmptyBox}>
          <p>
            You haven&apos;t joined any campaigns yet. Host a public or private
            campaign with Host game, or join using a Game ID &amp; passcode!
          </p>
        </div>
      )}
    </section>
  );
};
