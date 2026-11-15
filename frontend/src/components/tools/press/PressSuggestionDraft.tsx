import { Lightbulb } from 'lucide-react';
import type React from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import styles from './PressSuggestion.module.css';
import { SuggestedOrders } from './SuggestedOrders';

export interface PressSuggestionDraftProps {
  orders: Order[];
  viewer: Power;
  provinces: Record<string, ProvinceInfo>;
  unitsByProvince: Record<string, Unit>;
  onRemove: (unitId: string) => void;
  onDiscard: () => void;
}

/** The move suggestion being written, above the message field it will be sent with. */
export const PressSuggestionDraft: React.FC<PressSuggestionDraftProps> = ({
  orders,
  viewer,
  provinces,
  unitsByProvince,
  onRemove,
  onDiscard,
}) => (
  <div className={styles.draft} data-testid="press-suggestion-draft">
    <div className={styles.draftTitle}>
      <Lightbulb size={11} aria-hidden="true" />
      <span>Suggested moves</span>
      <button
        type="button"
        className={styles.discardBtn}
        data-testid="press-suggestion-discard"
        onClick={onDiscard}
      >
        Discard
      </button>
    </div>
    {orders.length === 0 ? (
      <p className={styles.draftHint}>
        On the map, give orders to their units and to any of yours you want to
        show. Your real orders stay as they are.
      </p>
    ) : (
      <SuggestedOrders
        orders={orders}
        viewer={viewer}
        provinces={provinces}
        unitsByProvince={unitsByProvince}
        onRemove={onRemove}
      />
    )}
  </div>
);
