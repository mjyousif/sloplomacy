import {
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
  Zap,
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
import styles from './AuthModal.module.css';
import { Modal, ModalCloseButton } from './modal/Modal';

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
    <Modal
      onBackdropClick={onClose}
      cardClassName={styles.authModalCard}
      cardProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'auth-modal-title',
      }}
    >
      <div className={styles.authModalHeader}>
        <div className={styles.authModalTitleRow}>
          <ShieldCheck size={20} className={styles.authShieldIcon} />
          <h2 id="auth-modal-title">Diplomatic Credentials</h2>
        </div>
        <ModalCloseButton
          className={styles.authCloseBtn}
          onClick={onClose}
          aria-label="Close authentication modal"
        >
          <X size={18} />
        </ModalCloseButton>
      </div>

      {reasonBanner && (
        <div className={styles.authReasonBanner}>{reasonBanner}</div>
      )}

      <div className={styles.authProviderStatus}>
        {isSupabaseConfigured ? (
          <span className={styles.statusPill} data-source="live">
            ● Connected to Supabase Auth
          </span>
        ) : (
          <span className={styles.statusPill} data-source="local">
            <Zap size={12} /> Local Dev Auth Mode (Add VITE_SUPABASE_URL in .env
            for cloud)
          </span>
        )}
      </div>

      {/* One-Click OAuth Providers */}
      <div className={styles.authOauthGrid}>
        <button
          type="button"
          className={styles.oauthBtn}
          onClick={() => handleOAuth('google')}
          disabled={submitting}
        >
          <span className={styles.oauthIcon}>G</span>
          Continue with Google
        </button>
        <button
          type="button"
          className={styles.oauthBtn}
          onClick={() => handleOAuth('discord')}
          disabled={submitting}
        >
          <span className={styles.oauthIcon}>◈</span>
          Continue with Discord
        </button>
      </div>

      <div className={styles.authDivider}>
        <span>or use email credentials</span>
      </div>

      {/* Mode Switcher Tabs */}
      <div className={styles.authTabs}>
        <button
          type="button"
          data-testid="auth-tab-signin"
          data-active={tab === 'signin'}
          className={styles.authTab}
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
          data-testid="auth-tab-signup"
          data-active={tab === 'signup'}
          className={styles.authTab}
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
          data-testid="auth-tab-magic"
          data-active={tab === 'magic'}
          className={styles.authTab}
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

      <form onSubmit={handleSubmit} className={styles.authForm}>
        {tab === 'signup' && (
          <div className={styles.authField}>
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

        <div className={styles.authField}>
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
          <div className={styles.authField}>
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

        {error && <div className={styles.authErrorBox}>{error}</div>}
        {infoMessage && <div className={styles.authInfoBox}>{infoMessage}</div>}

        <button
          type="submit"
          className={styles.authSubmitBtn}
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

      <div className={styles.authFooterNote}>
        <span>Just want to experiment with moves?</span>
        <button
          type="button"
          className={styles.authGuestLink}
          onClick={onClose}
        >
          Continue in Guest Sandbox Mode →
        </button>
      </div>
    </Modal>
  );
};
