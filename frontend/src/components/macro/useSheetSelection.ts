import { useEffect, useRef, useState } from 'react';
import type { Order, Power, Unit } from '../../types/diplomacy';
import type { UiSpacing } from '../../utils/displayPrefs';
import type { SheetSnap } from '../../utils/sheetHelpers';

/**
 * The desktop order panel's compact-row toggle, backed by Display Settings (`uiSpacing`) when
 * provided or `localStorage` (`sloplomacy_compact_orders`) when standalone.
 */
export function useCompactOrders({
  uiSpacing,
  onToggleUiSpacing,
}: {
  uiSpacing?: UiSpacing;
  onToggleUiSpacing?: () => void;
}) {
  const [localCompactOrders, setLocalCompactOrders] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage.getItem('sloplomacy_compact_orders') === '1'
      );
    } catch {
      return false;
    }
  });
  const compactOrders =
    uiSpacing !== undefined ? uiSpacing === 'compact' : localCompactOrders;

  const handleToggleCompactOrders = () => {
    if (uiSpacing !== undefined && onToggleUiSpacing) {
      onToggleUiSpacing();
      return;
    }
    setLocalCompactOrders((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          'sloplomacy_compact_orders',
          next ? '1' : '0',
        );
      } catch {
        // Ignore storage failures in restricted contexts.
      }
      return next;
    });
  };

  return { compactOrders, handleToggleCompactOrders };
}

/**
 * Scrolls the desktop order list so the selected unit's card or build slot is visible.
 */
export function usePanelScroll({
  isSheet,
  collapsed,
  selectedUnitId,
  activePower,
}: {
  isSheet: boolean;
  collapsed: boolean;
  selectedUnitId: string | null;
  activePower: Power;
}) {
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSheet || collapsed || !selectedUnitId) return;
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
  }, [isSheet, collapsed, selectedUnitId, activePower]);

  return panelScrollRef;
}

/**
 * The phone sheet's two reactions to the selected unit. A finger has no hover, so the selected
 * unit's card lights up its provinces the way hovering a card does on desktop. And raising the
 * sheet while a unit is selected brings its card to the top of the list.
 *
 * Returns the ref for the sheet's body, which holds the cards. Only the sheet's own list
 * scrolls, never the page around it. Does nothing outside the sheet.
 */
export function useSheetSelection({
  isSheet,
  sheetSnap,
  selectedUnitId,
  activePower,
  units,
  orders,
  onHighlightProvinces,
}: {
  isSheet: boolean;
  sheetSnap: SheetSnap;
  selectedUnitId: string | null;
  activePower: Power;
  units: Unit[];
  orders: Record<string, Order>;
  onHighlightProvinces: (provinces: string[]) => void;
}) {
  const selectedFieldUnit = selectedUnitId
    ? units.find((u) => u.id === selectedUnitId)
    : undefined;
  const selectedFieldOrder = selectedFieldUnit
    ? orders[selectedFieldUnit.id]
    : undefined;
  const selectedProvincesKey = selectedFieldUnit
    ? [
        selectedFieldUnit.province,
        selectedFieldOrder?.target,
        selectedFieldOrder?.aux_unit_origin,
      ]
        .filter(Boolean)
        .join(',')
    : '';
  useEffect(() => {
    if (!isSheet) return;
    onHighlightProvinces(
      selectedProvincesKey ? selectedProvincesKey.split(',') : [],
    );
  }, [isSheet, selectedProvincesKey, onHighlightProvinces]);

  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isSheet || sheetSnap === 'peek' || !selectedUnitId) return;
    const body = sheetBodyRef.current;
    const scroller = body?.closest<HTMLElement>(
      '[data-testid="bottom-sheet-body"]',
    );
    const card = Array.from(
      body?.querySelectorAll<HTMLElement>(
        '[data-unit-id], [data-home-province]',
      ) ?? [],
    ).find(
      (el) =>
        el.dataset.unitId === selectedUnitId ||
        `BUILD_${activePower}_${el.dataset.homeProvince}` === selectedUnitId,
    );
    if (!scroller || !card) return;
    scroller.scrollTop +=
      card.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      8;
  }, [isSheet, sheetSnap, selectedUnitId, activePower]);

  return sheetBodyRef;
}
