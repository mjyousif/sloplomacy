import type React from 'react';
import { useState } from 'react';
import type { AuthUser, Power } from '../../../types/diplomacy';

interface JoinWithCodeFormOptions {
  user: AuthUser | null;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onJoinOrEnterGame: (
    gameId: string,
    power: Power,
    passcode?: string,
  ) => Promise<void>;
  /** Opens the match to watch without a seat; needs no account. */
  onWatchGame: (gameId: string, passcode?: string) => Promise<void>;
  /** The form is finished with: the seat was claimed, or a guest was sent to sign in. */
  onDone: () => void;
}

/** The Join with code form's fields and its submit handler. */
export function useJoinWithCodeForm({
  user,
  onOpenAuth,
  onJoinOrEnterGame,
  onWatchGame,
  onDone,
}: JoinWithCodeFormOptions) {
  const [joinCodeGameId, setJoinCodeGameId] = useState('');
  const [joinCodePasscode, setJoinCodePasscode] = useState('');
  const [joinCodePower, setJoinCodePower] = useState<Power>('ENGLAND');
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  const handleJoinCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth('Sign in or create an account to join a campaign.', 'signin');
      onDone();
      return;
    }

    const cleanId = joinCodeGameId.trim();
    if (!cleanId) return;

    setJoinCodeLoading(true);
    setJoinCodeError(null);
    try {
      await onJoinOrEnterGame(cleanId, joinCodePower, joinCodePasscode.trim());
      setJoinCodeGameId('');
      setJoinCodePasscode('');
      onDone();
    } catch (err: any) {
      setJoinCodeError(
        err.message ||
          'Could not join campaign. Please verify Game ID and passcode.',
      );
    } finally {
      setJoinCodeLoading(false);
    }
  };

  // Watching needs only the Game ID and, for a private match, its passcode.
  const handleWatchClick = async () => {
    const cleanId = joinCodeGameId.trim();
    if (!cleanId) return;
    setJoinCodeLoading(true);
    setJoinCodeError(null);
    try {
      await onWatchGame(cleanId, joinCodePasscode.trim());
      setJoinCodeGameId('');
      setJoinCodePasscode('');
      onDone();
    } catch (err: any) {
      setJoinCodeError(err.message || 'Could not watch this campaign.');
    } finally {
      setJoinCodeLoading(false);
    }
  };

  return {
    /** Props for `JoinWithCodeCard`, apart from `user`. */
    card: {
      joinCodeGameId,
      setJoinCodeGameId,
      joinCodePasscode,
      setJoinCodePasscode,
      joinCodePower,
      setJoinCodePower,
      joinCodeLoading,
      joinCodeError,
      handleJoinCodeSubmit,
      handleWatchClick,
    },
    clearError: () => setJoinCodeError(null),
    /** Fills in a Game ID (from a link) with an empty passcode, to be asked for. */
    prefill: (gameId: string) => {
      setJoinCodeGameId(gameId);
      setJoinCodePasscode('');
      setJoinCodeError(null);
    },
  };
}
