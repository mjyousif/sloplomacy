import { Compass, Crown, FlaskConical, LogIn, Sparkles } from 'lucide-react';
import type React from 'react';
import type { AuthUser } from '../../types/diplomacy';
import styles from './LobbyHero.module.css';

export interface LobbyHeroProps {
  user: AuthUser | null;
  onEnterSandbox: () => void;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
}

/** The banner at the top of the lobby: the Solo Sandbox button and the two mode cards. */
export const LobbyHero: React.FC<LobbyHeroProps> = ({
  user,
  onEnterSandbox,
  onOpenAuth,
}) => {
  return (
    <section className={styles.lobbyHero} data-testid="lobby-hero">
      <div>
        <div className={styles.lobbyBadgeRow}>
          <span className={styles.lobbyEraPill}>
            <Compass size={13} /> STANDARD 1901 DIPLOMACY
          </span>
          <span className={styles.lobbyEraPill} data-variant="gold">
            <Sparkles size={13} /> DATC ADJUDICATOR
          </span>
        </div>
        <h1 className={styles.lobbyHeroTitle}>The Chancellery of Europe</h1>
        <p className={styles.lobbyHeroSubtitle}>
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

        <div className={styles.lobbyHeroActions}>
          <button
            type="button"
            data-testid="btn-enter-sandbox"
            className={styles.lobbyPrimaryCta}
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
              className={styles.lobbySecondaryCta}
              onClick={() => onOpenAuth(undefined, 'signin')}
            >
              <LogIn size={17} />
              <span>Sign In / Create Account for Multiplayer</span>
            </button>
          )}
        </div>
      </div>

      {/* Feature Comparison Card */}
      <div className={styles.lobbyModeComparison}>
        <div className={styles.modeCard}>
          <div className={styles.modeCardHeader}>
            <FlaskConical size={16} />
            <span>Solo Sandbox (Guest or Practice)</span>
          </div>
          <ul>
            <li>Switch freely between all 7 Great Powers</li>
            <li>Tactical AI auto-plans opponent moves &amp; steps turns</li>
            <li>Simulate bounces, supports &amp; convoy chains</li>
          </ul>
        </div>
        <div className={styles.modeCard} data-variant="mp">
          <div className={styles.modeCardHeader}>
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
  );
};
