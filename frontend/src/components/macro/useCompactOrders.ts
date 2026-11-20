import { useState } from 'react';
import type { UiSpacing } from '../../utils/displayPrefs';

const STORAGE_KEY = 'sloplomacy_compact_orders';

/**
 * Whether the order cards are drawn compact. It follows the Display Settings spacing when the
 * panel is given one, and otherwise keeps its own choice in this browser.
 */
export function useCompactOrders(
  uiSpacing: UiSpacing | undefined,
  onToggleUiSpacing: (() => void) | undefined,
) {
  const [localCompactOrders, setLocalCompactOrders] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage.getItem(STORAGE_KEY) === '1'
      );
    } catch {
      return false;
    }
  });
  const compactOrders =
    uiSpacing !== undefined ? uiSpacing === 'compact' : localCompactOrders;

  const toggleCompactOrders = () => {
    if (uiSpacing !== undefined && onToggleUiSpacing) {
      onToggleUiSpacing();
      return;
    }
    setLocalCompactOrders((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage failures in restricted contexts.
      }
      return next;
    });
  };

  return { compactOrders, toggleCompactOrders };
}
