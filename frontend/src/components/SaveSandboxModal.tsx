import { BookmarkCheck, Save, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

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
    <div
      className="modal-backdrop"
      data-testid="save-sandbox-modal"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="passcode-prompt-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-sandbox-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="created-modal-header">
          <div className="created-modal-title">
            <Save size={20} className="title-icon" />
            <h3 id="save-sandbox-modal-title">Save Sandbox to Account</h3>
          </div>
          <button
            type="button"
            className="modal-close-icon"
            data-testid="btn-close-save-sandbox"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="created-modal-desc">
          Save your current solo board positions, hypothetical maneuvers, and
          turn chronicle to your profile. You can resume this scenario anytime
          from your active campaigns.
        </p>

        <form onSubmit={handleSubmit} className="passcode-modal-form">
          <div className="lobby-field">
            <label htmlFor="save-sandbox-name-input">Sandbox Name</label>
            <div className="passcode-input-wrap">
              <BookmarkCheck size={15} className="input-icon" />
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

          <div className="passcode-modal-actions">
            <button
              type="submit"
              className="modal-enter-btn"
              data-testid="btn-confirm-save-sandbox"
              disabled={saving || !name.trim()}
            >
              <Save size={14} />
              <span>{saving ? 'Saving...' : 'Save Sandbox'}</span>
            </button>
            <button
              type="button"
              className="modal-cancel-btn"
              data-testid="btn-cancel-save-sandbox"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
