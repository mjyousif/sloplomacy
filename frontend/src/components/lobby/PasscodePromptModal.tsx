import { AlertTriangle, KeyRound, Lock, X } from 'lucide-react';
import type React from 'react';
import {
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';

export interface PasscodePromptModalProps {
  passcodeModalTarget: { game: MultiplayerGameSummary; power: Power } | null;
  onClose: () => void;
  enteredModalPasscode: string;
  setEnteredModalPasscode: (val: string) => void;
  passcodeModalError: string | null;
  handlePasscodeModalSubmit: (e: React.FormEvent) => void;
  joiningKey: string | null;
}

export const PasscodePromptModal: React.FC<PasscodePromptModalProps> = ({
  passcodeModalTarget,
  onClose,
  enteredModalPasscode,
  setEnteredModalPasscode,
  passcodeModalError,
  handlePasscodeModalSubmit,
  joiningKey,
}) => {
  if (!passcodeModalTarget) return null;

  return (
    <div className="modal-backdrop">
      <div className="passcode-prompt-card">
        <div className="created-modal-header">
          <div className="created-modal-title">
            <Lock size={20} className="title-icon" />
            <h3>Enter Campaign Passcode</h3>
          </div>
          <button type="button" className="modal-close-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="created-modal-desc">
          <strong>&ldquo;{passcodeModalTarget.game.name}&rdquo;</strong> is a
          private campaign. Enter the host&rsquo;s passcode to take command of{' '}
          <strong>{POWER_METADATA[passcodeModalTarget.power].shortName}</strong>
          :
        </p>

        <form
          onSubmit={handlePasscodeModalSubmit}
          className="passcode-modal-form"
        >
          <div className="lobby-field">
            <label htmlFor="modal-passcode-input">Passcode</label>
            <div className="passcode-input-wrap">
              <KeyRound size={15} className="input-icon" />
              <input
                id="modal-passcode-input"
                type="text"
                placeholder="Enter passcode"
                value={enteredModalPasscode}
                onChange={(e) => setEnteredModalPasscode(e.target.value)}
                autoFocus
                required
              />
            </div>
            {passcodeModalError && (
              <div className="lobby-error-alert compact">
                <AlertTriangle size={13} />
                <span>{passcodeModalError}</span>
              </div>
            )}
          </div>

          <div className="passcode-modal-actions">
            <button
              type="submit"
              className="modal-enter-btn"
              disabled={
                joiningKey ===
                `${passcodeModalTarget.game.game_id}_${passcodeModalTarget.power}`
              }
            >
              <Lock size={14} />
              <span>
                {joiningKey ===
                `${passcodeModalTarget.game.game_id}_${passcodeModalTarget.power}`
                  ? 'Verifying...'
                  : `Unlock & Claim ${POWER_METADATA[passcodeModalTarget.power].shortName}`}
              </span>
            </button>
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
