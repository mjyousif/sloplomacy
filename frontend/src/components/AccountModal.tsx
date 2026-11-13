import { ShieldCheck, User as UserIcon, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { updateAccountDisplayName } from '../lib/supabase';
import type { AuthUser } from '../types/diplomacy';

interface AccountModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  onboarding?: boolean;
  onClose: () => void;
  onUpdated: (user: AuthUser, message?: string) => void;
  onSignOut: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  user,
  onboarding = false,
  onClose,
  onUpdated,
  onSignOut,
}) => {
  const [displayName, setDisplayName] = useState(
    user?.needsUsernameSetup ? '' : (user?.displayName ?? ''),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shownWith, setShownWith] = useState({
    isOpen,
    userId: user?.id ?? null,
  });
  if (shownWith.isOpen !== isOpen || shownWith.userId !== (user?.id ?? null)) {
    setShownWith({ isOpen, userId: user?.id ?? null });
    if (isOpen) {
      setDisplayName(user?.needsUsernameSetup ? '' : (user?.displayName ?? ''));
      setError(null);
      setSubmitting(false);
    }
  }

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await updateAccountDisplayName(user, displayName);
      if (res.user) {
        onUpdated(
          res.user,
          res.error ?? `Username updated to ${res.user.displayName}.`,
        );
        if (!res.error) {
          onClose();
        } else {
          setError(res.error);
        }
      } else {
        setError(res.error || 'Unable to update username.');
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
        aria-labelledby="account-modal-title"
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title-row">
            <ShieldCheck size={20} className="auth-shield-icon" />
            <h2 id="account-modal-title">
              {onboarding ? 'Choose Your Public Username' : 'Account Settings'}
            </h2>
          </div>
          <button
            type="button"
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Close account modal"
          >
            <X size={18} />
          </button>
        </div>

        {onboarding && (
          <div className="auth-reason-banner">
            Pick a public username so other players do not see your real name or
            email. If you skip this step, your name stays &ldquo;Envoy&rdquo;.
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="account-email">Signed-in Email (Private)</label>
            <input
              id="account-email"
              type="text"
              value={user.email}
              disabled
              readOnly
            />
          </div>

          <div className="auth-field">
            <label htmlFor="account-username">Public Username</label>
            <input
              id="account-username"
              type="text"
              placeholder="e.g. Metternich, IronChancellor"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={24}
              required
              autoFocus
            />
            <span className="auth-field-hint">
              2–24 characters. Shown in lobbies, room cards, and game standings.
            </span>
          </div>

          {error && <div className="auth-error-banner">{error}</div>}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting}
          >
            <UserIcon size={15} />
            <span>
              {submitting
                ? 'Saving...'
                : onboarding
                  ? 'Set Username'
                  : 'Save Username'}
            </span>
          </button>

          {!onboarding && (
            <button
              type="button"
              className="auth-oauth-btn"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              disabled={submitting}
            >
              <span>Sign Out</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
