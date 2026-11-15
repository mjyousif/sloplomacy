import { X } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type Order,
  type Power,
  type ProvinceInfo,
  type Unit,
} from '../../../types/diplomacy';
import {
  formatOrderSummary,
  isOrderIncomplete,
} from '../../../utils/orderHelpers';
import { PowerFlag } from '../../ui/PowerFlag';
import styles from './PressSuggestion.module.css';
import { powerName } from './pressLabels';

export interface SuggestedOrdersProps {
  orders: Order[];
  viewer: Power;
  provinces: Record<string, ProvinceInfo>;
  unitsByProvince: Record<string, Unit>;
  /** A draft's orders can be taken off one at a time. */
  onRemove?: (unitId: string) => void;
}

/** The orders of a move suggestion in words, grouped by the power whose units they are for. */
export const SuggestedOrders: React.FC<SuggestedOrdersProps> = ({
  orders,
  viewer,
  provinces,
  unitsByProvince,
  onRemove,
}) => (
  <div className={styles.orderGroups} data-testid="suggested-orders">
    {ALL_POWERS.filter((power) => orders.some((o) => o.power === power)).map(
      (power) => (
        <div
          key={power}
          className={styles.orderGroup}
          data-testid={`suggested-orders-${power}`}
        >
          <div className={styles.orderGroupName}>
            <PowerFlag
              power={power}
              width={15}
              height={10}
              aria-hidden="true"
            />
            {power === viewer ? 'Your units' : powerName(power)}
          </div>
          <ul className={styles.orderLines}>
            {orders
              .filter((o) => o.power === power)
              .map((order) => {
                const summary = formatOrderSummary(
                  order,
                  provinces,
                  unitsByProvince,
                );
                return (
                  <li
                    key={order.unit_id}
                    className={styles.orderLine}
                    data-testid="suggested-order"
                    data-incomplete={
                      isOrderIncomplete(order) ? 'true' : undefined
                    }
                    title={summary.targetText}
                  >
                    <span>{summary.fullSymbolic}</span>
                    {onRemove && (
                      <button
                        type="button"
                        className={styles.removeBtn}
                        aria-label={`Remove ${summary.fullSymbolic}`}
                        onClick={() => onRemove(order.unit_id)}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ),
    )}
  </div>
);
