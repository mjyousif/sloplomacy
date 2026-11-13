import { Compass, Crown, FlaskConical, LogIn, Sparkles } from 'lucide-react';
import type React from 'react';
import type { AuthUser } from '../../types/diplomacy';

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
    <section className="lobby-hero" data-testid="lobby-hero">
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
  );
};
