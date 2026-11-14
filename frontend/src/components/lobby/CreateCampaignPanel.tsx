import { AlertTriangle, Globe, Lock, PlusCircle } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import fieldStyles from '../FormField.module.css';
import styles from './LobbyFormCard.module.css';
import { PowerPicker } from './PowerPicker';

export interface CreateCampaignPanelProps {
  user: AuthUser | null;
  newGameName: string;
  setNewGameName: (val: string) => void;
  isPrivate: boolean;
  setIsPrivate: (val: boolean) => void;
  passcode: string;
  setPasscode: (val: string) => void;
  selectedCreatePower: Power;
  setSelectedCreatePower: (val: Power) => void;
  createError: string | null;
  creating: boolean;
  handleCreateMatch: (e: React.FormEvent) => void;
}

/** The Host New Multiplayer Game card: name, public or private, passcode, country. */
export const CreateCampaignPanel: React.FC<CreateCampaignPanelProps> = ({
  user,
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
}) => {
  return (
    <div className={styles.lobbyCreateCard} data-testid="create-campaign-card">
      <div className={styles.lobbyCreateHeader}>
        <PlusCircle size={18} />
        <h3>Host New Multiplayer Game</h3>
      </div>
      <p className={styles.lobbyCreateDesc}>
        Create a new 1901 European theater as either a public match or a private
        campaign with a secret passcode.
      </p>

      <form onSubmit={handleCreateMatch} className={styles.lobbyCreateForm}>
        <div className={fieldStyles.lobbyField}>
          <label htmlFor="new-game-name">Campaign Name</label>
          <input
            id="new-game-name"
            type="text"
            placeholder="e.g. Congress of Vienna #42"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
          />
        </div>

        {/* Public vs Private Campaign Toggle */}
        <div className={fieldStyles.lobbyField}>
          <label>Campaign Access</label>
          <div className={styles.privacyToggleRow}>
            <button
              type="button"
              data-active={!isPrivate ? 'true' : undefined}
              className={styles.privacyToggleBtn}
              onClick={() => {
                setIsPrivate(false);
                setPasscode('');
              }}
            >
              <Globe size={13} />
              <span>Public Lobby</span>
            </button>
            <button
              type="button"
              data-active={isPrivate ? 'true' : undefined}
              className={styles.privacyToggleBtn}
              onClick={() => setIsPrivate(true)}
            >
              <Lock size={13} />
              <span>Private (Passcode)</span>
            </button>
          </div>
        </div>

        {isPrivate && (
          <div className={fieldStyles.lobbyField}>
            <label htmlFor="private-passcode">Campaign Passcode / PIN</label>
            <input
              id="private-passcode"
              type="text"
              placeholder="Enter secret passcode (e.g. Vienna1901)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required={isPrivate}
            />
            <span className={styles.fieldHint}>
              Players will need to enter this passcode to join your private
              campaign.
            </span>
          </div>
        )}

        <div className={fieldStyles.lobbyField}>
          <label>Pick Your Sovereign Country</label>
          <PowerPicker
            selected={selectedCreatePower}
            onSelect={setSelectedCreatePower}
          />
        </div>

        {createError && (
          <div
            className={fieldStyles.lobbyErrorAlert}
            data-testid="create-campaign-error"
          >
            <AlertTriangle size={14} />
            <span>{createError}</span>
          </div>
        )}

        <button
          type="submit"
          className={styles.lobbyCreateSubmitBtn}
          disabled={creating}
        >
          <PlusCircle size={16} />
          <span>
            {creating
              ? 'Creating Campaign...'
              : user
                ? `Create ${isPrivate ? 'Private' : ''} & Play as ${POWER_METADATA[selectedCreatePower].shortName}`
                : 'Sign In to Host Campaign'}
          </span>
        </button>
      </form>
    </div>
  );
};
