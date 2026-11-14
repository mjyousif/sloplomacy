import { Send, VenetianMask } from 'lucide-react';
import type React from 'react';
import { useId } from 'react';
import styles from '../PressSection.module.css';

/** Mirrors MAX_PRESS_BODY_LENGTH in backend/domain/press.py. */
export const MAX_PRESS_BODY_LENGTH = 1000;

export interface PressComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  anonymous: boolean;
  onAnonymousChange: (anonymous: boolean) => void;
  /** Says in words where the message will go. */
  destination: string;
  /** Why nothing can be sent right now, or null when it can. */
  blocked: string | null;
  sending: boolean;
  error: string | null;
  /** Only signed public messages can be sent (the game is over), so the boxes are left out. */
  plainOnly?: boolean;
  onSend: () => void;
}

/**
 * Where a message is written: the text, the mask button that posts it anonymously, and Send.
 * Who it goes to privately is picked with the letter buttons on the Diplomatic Standing rows.
 */
export const PressComposer: React.FC<PressComposerProps> = ({
  draft,
  onDraftChange,
  anonymous,
  onAnonymousChange,
  destination,
  blocked,
  sending,
  error,
  plainOnly = false,
  onSend,
}) => {
  const hintId = useId();
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MAX_PRESS_BODY_LENGTH;
  const canSend = !blocked && !sending && trimmed.length > 0 && !tooLong;
  return (
    <form
      className={styles.composer}
      data-testid="press-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className={styles.composerRow}>
        <textarea
          className={styles.composerInput}
          data-testid="press-input"
          aria-label="Message"
          aria-describedby={hintId}
          placeholder={anonymous ? 'Write anonymously…' : 'Write a message…'}
          data-anonymous={anonymous ? 'true' : undefined}
          rows={2}
          disabled={Boolean(blocked)}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line.
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        {!plainOnly && (
          <button
            type="button"
            className={styles.anonymousBtn}
            data-testid="press-anonymous"
            data-active={anonymous ? 'true' : undefined}
            aria-pressed={anonymous}
            aria-label="Post anonymously"
            title={
              anonymous
                ? 'Posting anonymously (click to sign your messages)'
                : 'Post anonymously'
            }
            onClick={() => onAnonymousChange(!anonymous)}
          >
            <VenetianMask size={15} />
          </button>
        )}
        <button
          type="submit"
          className={styles.sendBtn}
          data-testid="press-send"
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
      <p
        id={hintId}
        className={styles.destination}
        data-testid="press-destination"
        data-blocked={blocked ? 'true' : undefined}
        // Where the message goes is read out with the field, but only drawn when something
        // stops it being sent: the caption over the messages already shows it.
        data-quiet={blocked || tooLong ? undefined : 'true'}
      >
        {blocked ?? destination}
        {tooLong && ` · ${trimmed.length}/${MAX_PRESS_BODY_LENGTH}`}
      </p>
      {error && (
        <p className={styles.sendError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
};
