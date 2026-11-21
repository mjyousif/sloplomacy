import { Lightbulb } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { suggestionStore } from '../../../lib/suggestionStore';
import type {
  Power,
  PressMessage,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import styles from './PressSuggestion.module.css';
import { SuggestedOrders } from './SuggestedOrders';

/** What the message list needs to draw and act on the move suggestions in it. */
export interface PressSuggestionContext {
  unitsByProvince: Record<string, Unit>;
  /** The turn being played, e.g. "Spring 1901 Movement". */
  turn: string;
  /** False while the board shows something else (Hypothetical Mode, a past turn, Direct-Edit). */
  boardFree: boolean;
  /** The suggestion on the map now, if it is a message's. */
  viewingId: string | null;
}

export interface PressSuggestionCardProps extends PressSuggestionContext {
  message: PressMessage;
  viewer: Power | null;
  provinces: Record<string, ProvinceInfo>;
  /** The map was asked for (the phone closes its drawer to show it). */
  onShowMap?: () => void;
}

/**
 * The orders a message suggests, under its text. During the turn it was sent in they can be
 * shown on the map, and the ones for the player's own units or build slots copied into their
 * orders (still editable, nothing finalized). Afterwards only the text of the orders is left.
 */
export const PressSuggestionCard: React.FC<PressSuggestionCardProps> = ({
  message,
  viewer,
  provinces,
  unitsByProvince,
  turn,
  boardFree,
  viewingId,
  onShowMap,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = `${message.season} ${message.year} ${message.phase}` === turn;
  const shown = viewingId === message.id;
  const mine = viewer
    ? message.orders.filter((order) => order.power === viewer)
    : [];
  const fromMe = viewer !== null && message.sender === viewer;

  const take = async () => {
    setBusy(true);
    setError(null);
    const problem = await suggestionStore.adopt(mine);
    setBusy(false);
    if (problem) setError(problem);
    else if (shown) suggestionStore.clear();
  };

  return (
    <div className={styles.card} data-testid="press-suggestion">
      <div className={styles.cardTitle}>
        <Lightbulb size={11} aria-hidden="true" />
        Suggested orders
      </div>
      <SuggestedOrders
        orders={message.orders}
        viewer={viewer}
        provinces={provinces}
        unitsByProvince={unitsByProvince}
      />
      {current ? (
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.cardBtn}
            data-testid="suggestion-show"
            aria-pressed={shown}
            disabled={!boardFree}
            title={
              boardFree
                ? undefined
                : 'Return to the live board to see it on the map'
            }
            onClick={() => {
              if (shown) suggestionStore.clear();
              else {
                suggestionStore.view(message);
                onShowMap?.();
              }
            }}
          >
            {shown ? 'Hide from map' : 'Show on map'}
          </button>
          {!fromMe && mine.length > 0 && (
            <button
              type="button"
              className={styles.cardBtn}
              data-variant="primary"
              data-testid="suggestion-use"
              disabled={busy || !boardFree}
              title="Copy the orders for your units into your own orders. Nothing is finalized."
              onClick={take}
            >
              Use these orders
            </button>
          )}
        </div>
      ) : (
        <p className={styles.cardStale} data-testid="suggestion-stale">
          For {message.season} {message.year}, which has passed.
        </p>
      )}
      {error && (
        <p className={styles.cardError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
