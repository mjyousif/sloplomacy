import { useEffect, useRef } from 'react';
import type { Order, Power, Unit } from '../../types/diplomacy';
import type { SheetSnap } from '../../utils/sheetHelpers';

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
