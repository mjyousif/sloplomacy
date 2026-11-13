import { AlertTriangle, KeyRound, Lock, X } from 'lucide-react';
import type React from 'react';
import {
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import fieldStyles from '../FormField.module.css';
import { Modal, ModalCloseButton, ModalFooter } from '../modal/Modal';
import promptStyles from '../modal/PromptDialog.module.css';

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
    <Modal cardClassName={promptStyles.card}>
      <div className={promptStyles.header}>
        <div className={promptStyles.title}>
          <Lock size={20} />
          <h3>Enter Campaign Passcode</h3>
        </div>
        <ModalCloseButton className={promptStyles.close} onClick={onClose}>
          <X size={18} />
        </ModalCloseButton>
      </div>

      <p className={promptStyles.description}>
        <strong>&ldquo;{passcodeModalTarget.game.name}&rdquo;</strong> is a
        private campaign. Enter the host&rsquo;s passcode to take command of{' '}
        <strong>{POWER_METADATA[passcodeModalTarget.power].shortName}</strong>:
      </p>

      <form onSubmit={handlePasscodeModalSubmit} className={promptStyles.form}>
        <div className={fieldStyles.lobbyField}>
          <label htmlFor="modal-passcode-input">Passcode</label>
          <div className={fieldStyles.passcodeInputWrap}>
            <KeyRound size={15} className={fieldStyles.inputIcon} />
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
            <div
              className={fieldStyles.lobbyErrorAlert}
              data-testid="passcode-modal-error"
            >
              <AlertTriangle size={13} />
              <span>{passcodeModalError}</span>
            </div>
          )}
        </div>

        <ModalFooter className={promptStyles.actions}>
          <button
            type="submit"
            className={promptStyles.enterButton}
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
            className={promptStyles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
