import { AlertTriangle, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-app confirmation for destructive actions.
 *
 * Browser dialogs (`window.confirm`) are not used, because once a player ticks
 * "don't allow this page to show dialogs" the browser answers `false` without
 * showing anything, and the action silently does nothing (issues #75 and #77).
 *
 * Holding Shift while clicking the action skips the confirmation, and the modal
 * says so.
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
}

interface ConfirmModalProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div
        className="confirm-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div className="confirm-modal-title-group">
            <AlertTriangle size={20} className="confirm-modal-icon" />
            <h3 id="confirm-modal-title">{title}</h3>
          </div>
          <button
            type="button"
            className="confirm-modal-close"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>
        <p id="confirm-modal-message" className="confirm-modal-message">
          {message}
        </p>
        <p className="confirm-modal-tip">
          Tip: hold <kbd>Shift</kbd> while clicking to skip this confirmation.
        </p>
        <div className="confirm-modal-footer">
          <button
            type="button"
            className="confirm-modal-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            data-testid="btn-confirm-modal-confirm"
            className="confirm-modal-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** True when the click that started an action should skip the confirmation. */
export const skipsConfirmation = (
  event?: { shiftKey?: boolean } | null,
): boolean => Boolean(event?.shiftKey);

/**
 * `confirm(options, event)` resolves `true` at once when Shift was held during
 * `event`, otherwise it opens the modal and resolves with the player's answer.
 * Render `confirmModal` somewhere in the component.
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (
      options: ConfirmOptions,
      event?: { shiftKey?: boolean } | null,
    ): Promise<boolean> => {
      if (skipsConfirmation(event)) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        setPending((prev) => {
          // A second request replaces the first, which counts as cancelled.
          prev?.resolve(false);
          return { options, resolve };
        });
      });
    },
    [],
  );

  const answer = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);
  const onConfirm = useCallback(() => answer(true), [answer]);
  const onCancel = useCallback(() => answer(false), [answer]);

  const confirmModal = pending ? (
    <ConfirmModal
      {...pending.options}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  ) : null;

  return { confirm, confirmModal };
}
