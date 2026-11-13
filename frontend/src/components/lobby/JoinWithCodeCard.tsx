import { AlertTriangle, KeyRound } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { PowerPicker } from './PowerPicker';

export interface JoinWithCodeCardProps {
  user: AuthUser | null;
  joinCodeGameId: string;
  setJoinCodeGameId: (val: string) => void;
  joinCodePasscode: string;
  setJoinCodePasscode: (val: string) => void;
  joinCodePower: Power;
  setJoinCodePower: (val: Power) => void;
  joinCodeLoading: boolean;
  joinCodeError: string | null;
  handleJoinCodeSubmit: (e: React.FormEvent) => void;
}

/** The Join Private Campaign card: a Game ID, a passcode and the country to claim. */
export const JoinWithCodeCard: React.FC<JoinWithCodeCardProps> = ({
  user,
  joinCodeGameId,
  setJoinCodeGameId,
  joinCodePasscode,
  setJoinCodePasscode,
  joinCodePower,
  setJoinCodePower,
  joinCodeLoading,
  joinCodeError,
  handleJoinCodeSubmit,
}) => {
  return (
    <div className="lobby-create-card join-card" style={{ marginTop: '20px' }}>
      <div className="lobby-create-header">
        <KeyRound size={18} />
        <h3>Join Private Campaign</h3>
      </div>
      <p className="lobby-create-desc">
        Have a Game ID and passcode from a host? Enter them below to claim your
        nation and join the war room.
      </p>

      <form onSubmit={handleJoinCodeSubmit} className="lobby-create-form">
        <div className="lobby-field">
          <label htmlFor="join-code-id">Game ID</label>
          <input
            id="join-code-id"
            type="text"
            placeholder="e.g. mp_3d8f2b"
            value={joinCodeGameId}
            onChange={(e) => setJoinCodeGameId(e.target.value)}
            required
          />
        </div>

        <div className="lobby-field">
          <label htmlFor="join-code-passcode">Lobby Passcode</label>
          <input
            id="join-code-passcode"
            type="text"
            placeholder="Enter lobby passcode"
            value={joinCodePasscode}
            onChange={(e) => setJoinCodePasscode(e.target.value)}
          />
        </div>

        <div className="lobby-field">
          <label>Nation to Claim</label>
          <PowerPicker selected={joinCodePower} onSelect={setJoinCodePower} />
        </div>

        {joinCodeError && (
          <div className="lobby-error-alert" data-testid="join-code-error">
            <AlertTriangle size={14} />
            <span>{joinCodeError}</span>
          </div>
        )}

        <button
          type="submit"
          className="lobby-join-submit-btn"
          disabled={joinCodeLoading || !joinCodeGameId.trim()}
        >
          <KeyRound size={15} />
          <span>
            {joinCodeLoading
              ? 'Verifying & Joining...'
              : user
                ? `Unlock & Claim ${POWER_METADATA[joinCodePower].shortName}`
                : 'Sign In to Join Campaign'}
          </span>
        </button>
      </form>
    </div>
  );
};
