import type React from 'react';
import { useState } from 'react';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../../../types/diplomacy';
import { defaultCampaignName } from '../../../utils/campaignName';

/** The Game ID and passcode a host is shown once after creating a private campaign. */
export interface CreatedPrivateCampaign {
  gameId: string;
  name: string;
  passcode: string;
  power: Power;
}

interface HostGameFormOptions {
  user: AuthUser | null;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onCreateGame: (
    name: string,
    power: Power,
    isPrivate?: boolean,
    passcode?: string,
  ) => Promise<MultiplayerGameSummary | void>;
  /** The form is finished with: the game was created, or a guest was sent to sign up. */
  onDone: () => void;
}

/** The Host form's fields, its submit handler and the credentials of a new private campaign. */
export function useHostGameForm({
  user,
  onOpenAuth,
  onCreateGame,
  onDone,
}: HostGameFormOptions) {
  const [newGameName, setNewGameName] = useState('');
  const [selectedCreatePower, setSelectedCreatePower] =
    useState<Power>('FRANCE');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [passcode, setPasscode] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdPrivate, setCreatedPrivate] =
    useState<CreatedPrivateCampaign | null>(null);

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth(
        'Sign in or create an account to host a new multiplayer campaign.',
        'signup',
      );
      onDone();
      return;
    }

    if (isPrivate && !passcode.trim()) {
      setCreateError('Please specify a passcode for your private campaign.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const summary = await onCreateGame(
        newGameName.trim() || defaultCampaignName(user.displayName),
        selectedCreatePower,
        isPrivate,
        passcode.trim(),
      );

      if (isPrivate && summary && passcode.trim()) {
        setCreatedPrivate({
          gameId: summary.game_id,
          name: summary.name,
          passcode: passcode.trim(),
          power: selectedCreatePower,
        });
      }

      setNewGameName('');
      setPasscode('');
      onDone();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  return {
    /** Props for `CreateCampaignPanel`, apart from `user`. */
    panel: {
      newGameName,
      setNewGameName,
      isPrivate,
      setIsPrivate,
      passcode,
      setPasscode,
      selectedCreatePower,
      setSelectedCreatePower,
      createError,
      creating,
      handleCreateMatch,
    },
    createdPrivate,
    closeCreatedPrivate: () => setCreatedPrivate(null),
    clearError: () => setCreateError(null),
  };
}
