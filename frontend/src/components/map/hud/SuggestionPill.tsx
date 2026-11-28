import { Lightbulb, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { SuggestionBoard } from '../../../hooks/useSuggestion';
import { suggestionStore } from '../../../lib/suggestionStore';
import styles from './SuggestionPill.module.css';

export interface SuggestionPillProps {
  suggestion: SuggestionBoard;
  onClose: () => void;
}

const plural = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

/**
 * Sits on the map while a move suggestion has the board. While one is being written it says
 * who it is for and how to send it. A received one can be taken from here: the orders for the
 * player's own units replace those units' real orders, and nothing is finalized.
 */
export const SuggestionPill: React.FC<SuggestionPillProps> = ({
  suggestion,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = suggestion.mode === 'draft';

  const take = async () => {
    setBusy(true);
    setError(null);
    const problem = await suggestionStore.adopt(suggestion.mine);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <div
      className={styles.suggestionPill}
      data-testid="suggestion-pill"
      data-mode={suggestion.mode}
      role="group"
      aria-label={`Showing ${suggestion.label}`}
    >
      <Lightbulb size={14} aria-hidden="true" />
      <span className={styles.label} data-testid="suggestion-pill-label">
        {draft ? (
          <>
            Writing <strong>{suggestion.label}</strong> ·{' '}
            {suggestion.count === 0
              ? 'order units or build slots on the map'
              : `${plural(suggestion.count)}, send from Press`}
          </>
        ) : (
          <>
            Viewing <strong>{suggestion.label}</strong> ·{' '}
            {plural(suggestion.count)}
          </>
        )}
        {error && (
          <span className={styles.error} role="alert">
            {' '}
            {error}
          </span>
        )}
      </span>
      {/* An opening is used from the order panel, where it was picked. */}
      {suggestion.mode === 'view' && suggestion.mine.length > 0 && (
        <button
          type="button"
          className={styles.takeBtn}
          data-testid="suggestion-take"
          disabled={busy}
          onClick={take}
          title="Copy the orders for your units into your own orders. Nothing is finalized."
        >
          Use these orders
        </button>
      )}
      <button
        type="button"
        className={styles.closeBtn}
        data-testid="suggestion-close"
        onClick={onClose}
        aria-label={
          draft
            ? 'Discard the suggestion'
            : suggestion.mode === 'opening'
              ? 'Close the opening preview'
              : 'Close the suggestion'
        }
        title={draft ? 'Discard the suggestion' : 'Back to your orders'}
      >
        <X size={15} />
      </button>
    </div>
  );
};
