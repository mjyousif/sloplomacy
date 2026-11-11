import {
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  isSupabaseConfigured,
  sendMagicLink,
  signInWithEmailPassword,
  signInWithOAuthProvider,
  signUpWithEmailPassword,
} from '../lib/supabase';
import type { AuthUser } from '../types/diplomacy';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, message?: string) => void;
  initialTab?: 'signin' | 'signup' | 'magic';
  reasonBanner?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialTab = 'signin',
  reasonBanner,
}) => {
  const [tab, setTab] = useState<'signin' | 'signup' | 'magic'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // The modal stays mounted while closed, so `useState(initialTab)` alone
  // would keep the first tab forever. Reset during render (not in an
  // effect) so the right tab shows on the first paint: every opening starts
  // clean on `initialTab`, and a new `initialTab` while open switches tabs
  // the way the tab buttons do.
  const [shownWith, setShownWith] = useState({ isOpen, initialTab });
  if (shownWith.isOpen !== isOpen || shownWith.initialTab !== initialTab) {
    const reopened = isOpen && !shownWith.isOpen;
    setShownWith({ isOpen, initialTab });
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      setInfoMessage(null);
    }
    if (reopened) {
      setEmail('');
      setPassword('');
      setDisplayName('');
    }
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);

    try {
      if (tab === 'signin') {
        const res = await signInWithEmailPassword(email, password);
        if (res.error) {
          setError(res.error);
        } else if (res.user) {
          onSuccess(res.user, `Welcome back, ${res.user.displayName}!`);
          onClose();
        }
      } else if (tab === 'signup') {
        const res = await signUpWithEmailPassword(email, password, displayName);
        if (res.error) {
          setError(res.error);
        } else if (res.user) {
          if (res.message) {
            setInfoMessage(res.message);
          } else {
            onSuccess(
              res.user,
              `Account created! Welcome to the Diplomatic Corps, ${res.user.displayName}.`,
            );
            onClose();
          }
        }
      } else if (tab === 'magic') {
        const res = await sendMagicLink(email);
        if (res.error) {
          setError(res.error);
        } else if (res.sent) {
          if (isSupabaseConfigured) {
            setInfoMessage(
              `Magic sign-in link sent to ${email}. Check your inbox!`,
            );
          } else {
            onClose();
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'discord') => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await signInWithOAuthProvider(provider);
      if (res.error) {
        setError(res.error);
      } else if (!isSupabaseConfigured) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop auth-modal-backdrop" onClick={onClose}>
      <div
        className="auth-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title-row">
            <ShieldCheck size={20} className="auth-shield-icon" />
            <h2 id="auth-modal-title">Diplomatic Credentials</h2>
          </div>
          <button
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            <X size={18} />
          </button>
        </div>

        {reasonBanner && (
          <div className="auth-reason-banner">{reasonBanner}</div>
        )}

        <div className="auth-provider-status">
          {isSupabaseConfigured ? (
            <span className="status-pill supabase-live">
              ● Connected to Supabase Auth
            </span>
          ) : (
            <span className="status-pill supabase-local">
              ⚡ Local Dev Auth Mode (Add VITE_SUPABASE_URL in .env for cloud)
            </span>
          )}
        </div>

        {/* One-Click OAuth Providers */}
        <div className="auth-oauth-grid">
          <button
            type="button"
            className="oauth-btn"
            onClick={() => handleOAuth('google')}
            disabled={submitting}
          >
            <span className="oauth-icon">G</span>
            Continue with Google
          </button>
          <button
            type="button"
            className="oauth-btn"
            onClick={() => handleOAuth('discord')}
            disabled={submitting}
          >
            <span className="oauth-icon">◈</span>
            Continue with Discord
          </button>
        </div>

        <div className="auth-divider">
          <span>or use email credentials</span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setTab('signin');
              setError(null);
              setInfoMessage(null);
            }}
          >
            <LogIn size={14} />
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setTab('signup');
              setError(null);
              setInfoMessage(null);
            }}
          >
            <UserPlus size={14} />
            Create Account
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'magic' ? 'active' : ''}`}
            onClick={() => {
              setTab('magic');
              setError(null);
              setInfoMessage(null);
            }}
          >
            <Sparkles size={14} />
            Magic Link
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-display-name"> Envoy / Commander Name</label>
              <input
                id="auth-display-name"
                type="text"
                name="name"
                autoComplete="name"
                placeholder="e.g. Talleyrand"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">
              <Mail size={13} /> Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              name="email"
              autoComplete="username webauthn"
              placeholder="envoy@chancellery.eu"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {tab !== 'magic' && (
            <div className="auth-field">
              <label htmlFor="auth-password">
                <KeyRound size={13} /> Password
              </label>
              <input
                id="auth-password"
                type="password"
                name="password"
                autoComplete={
                  tab === 'signup' ? 'new-password' : 'current-password'
                }
                placeholder="Minimum 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && <div className="auth-error-box">{error}</div>}
          {infoMessage && <div className="auth-info-box">{infoMessage}</div>}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting}
          >
            {submitting
              ? 'Authenticating...'
              : tab === 'signin'
                ? 'Sign In to Chancellery'
                : tab === 'signup'
                  ? 'Create Diplomatic Account'
                  : 'Send Passwordless Magic Link'}
          </button>
        </form>

        <div className="auth-footer-note">
          <span>Just want to experiment with moves?</span>
          <button type="button" className="auth-guest-link" onClick={onClose}>
            Continue in Guest Sandbox Mode →
          </button>
        </div>
      </div>
    </div>
  );
};
