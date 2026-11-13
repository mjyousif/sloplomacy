import { BookmarkCheck, Save, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import fieldStyles from './FormField.module.css';
import { Modal, ModalCloseButton, ModalFooter } from './modal/Modal';
import promptStyles from './modal/PromptDialog.module.css';

export interface SaveSandboxModalProps {
  isOpen: boolean;
  defaultName: string;
  saving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const SaveSandboxModal: React.FC<SaveSandboxModalProps> = ({
  isOpen,
  defaultName,
  saving,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      inputRef.current?.select();
    }
  }, [isOpen, defaultName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, saving, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || saving) return;
    onSave(cleanName);
  };

  return (
    <Modal
      onBackdropClick={saving ? undefined : onCancel}
      isolateClicks
      cardClassName={promptStyles.card}
      backdropProps={{ 'data-testid': 'save-sandbox-modal' }}
      cardProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'save-sandbox-modal-title',
      }}
    >
      <div className={promptStyles.header}>
        <div className={promptStyles.title}>
          <Save size={20} />
          <h3 id="save-sandbox-modal-title">Save Sandbox to Account</h3>
        </div>
        <ModalCloseButton
          className={promptStyles.close}
          data-testid="btn-close-save-sandbox"
          onClick={onCancel}
          disabled={saving}
          aria-label="Close"
        >
          <X size={18} />
        </ModalCloseButton>
      </div>

      <p className={promptStyles.description}>
        Save your current solo board positions, hypothetical maneuvers, and turn
        chronicle to your profile. You can resume this scenario anytime from
        your active campaigns.
      </p>

      <form onSubmit={handleSubmit} className={promptStyles.form}>
        <div className={fieldStyles.lobbyField}>
          <label htmlFor="save-sandbox-name-input">Sandbox Name</label>
          <div className={fieldStyles.passcodeInputWrap}>
            <BookmarkCheck size={15} className={fieldStyles.inputIcon} />
            <input
              id="save-sandbox-name-input"
              data-testid="input-sandbox-name"
              ref={inputRef}
              type="text"
              placeholder="Name your sandbox scenario"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={saving}
            />
          </div>
        </div>

        <ModalFooter className={promptStyles.actions}>
          <button
            type="submit"
            className={promptStyles.enterButton}
            data-testid="btn-confirm-save-sandbox"
            disabled={saving || !name.trim()}
          >
            <Save size={14} />
            <span>{saving ? 'Saving...' : 'Save Sandbox'}</span>
          </button>
          <button
            type="button"
            className={promptStyles.cancelButton}
            data-testid="btn-cancel-save-sandbox"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
