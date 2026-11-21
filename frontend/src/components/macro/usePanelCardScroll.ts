import { useEffect, useRef } from 'react';
import type { Power } from '../../types/diplomacy';

/**
 * Scrolls the desktop panel's list so the selected unit's (or build slot's) card is in view,
 * a little clear of the edge. Returns the ref for the scrolling element. The phone sheet has
 * its own version (`useSheetSelection`).
 */
export function usePanelCardScroll({
  enabled,
  selectedUnitId,
  activePower,
}: {
  enabled: boolean;
  selectedUnitId: string | null;
  activePower: Power;
}) {
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled || !selectedUnitId) return;
    const scroller = panelScrollRef.current;
    if (!scroller) return;
    const card = Array.from(
      scroller.querySelectorAll<HTMLElement>(
        '[data-unit-id], [data-home-province]',
      ),
    ).find(
      (el) =>
        el.dataset.unitId === selectedUnitId ||
        `BUILD_${activePower}_${el.dataset.homeProvince}` === selectedUnitId,
    );
    if (!card) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.top < scrollerRect.top) {
      scroller.scrollTop += cardRect.top - scrollerRect.top - 8;
    } else if (cardRect.bottom > scrollerRect.bottom) {
      scroller.scrollTop += cardRect.bottom - scrollerRect.bottom + 8;
    }
  }, [enabled, selectedUnitId, activePower]);
  return panelScrollRef;
}
