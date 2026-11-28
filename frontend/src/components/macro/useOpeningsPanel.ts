import { useEffect, useMemo, useState } from 'react';
import type { Opening } from '../../data/openings';
import { useSuggestionState } from '../../hooks/useSuggestion';
import { suggestionStore } from '../../lib/suggestionStore';
import type { Order, Power, Unit } from '../../types/diplomacy';
import { openingOrders, openingsFor } from '../../utils/openings';

export interface OpeningEntry {
  opening: Opening;
  /** Its orders for the board as it stands, or null when the units are no longer in place. */
  orders: Order[] | null;
}

export interface OpeningsPanel {
  /** Whether the order panel offers openings at all: Spring 1901, a power the player orders. */
  available: boolean;
  /** The list is showing in place of the unit cards. */
  open: boolean;
  toggle: () => void;
  close: () => void;
  entries: OpeningEntry[];
  /** The opening on the map, if any. */
  selectedId: string | null;
  select: (entry: OpeningEntry) => void;
  /** Sends the opening's orders. Resolves to an error text, or null. */
  use: (entry: OpeningEntry) => Promise<string | null>;
}

/**
 * The Openings list of the order panel. Picking one swaps its orders onto the map, the way a
 * received move suggestion is shown; using one sends them as the player's own. Closing the
 * list, switching power or leaving the first turn takes the preview off the map.
 */
export function useOpeningsPanel({
  available,
  power,
  units,
  turn,
}: {
  available: boolean;
  power: Power;
  units: Unit[];
  /** e.g. "Spring 1901 Movement", for the preview to end with the turn. */
  turn: string;
}): OpeningsPanel {
  const [open, setOpen] = useState(false);
  const { opening: preview } = useSuggestionState();
  const ownPreview = preview?.power === power ? preview : null;

  const entries = useMemo(
    () =>
      openingsFor(power).map((opening) => ({
        opening,
        orders: openingOrders(opening, units),
      })),
    [power, units],
  );

  // A new power, or the end of the first turn, closes the list and its preview.
  useEffect(() => {
    setOpen(false);
    if (suggestionStore.getState().opening) suggestionStore.clear();
  }, [power, available]);

  const close = () => {
    setOpen(false);
    if (suggestionStore.getState().opening) suggestionStore.clear();
  };

  return {
    available,
    open: open && available,
    toggle: () => (open ? close() : setOpen(true)),
    close,
    entries,
    selectedId: ownPreview?.id ?? null,
    select: ({ opening, orders }) => {
      if (!orders) return;
      if (ownPreview?.id === opening.id) {
        suggestionStore.clear();
        return;
      }
      suggestionStore.previewOpening({
        id: opening.id,
        name: opening.name,
        power: opening.power,
        turn,
        orders,
      });
    },
    use: async ({ opening, orders }) => {
      if (!orders) return 'Your units are no longer where this opening starts.';
      const problem = await suggestionStore.applyOpening(opening.power, orders);
      if (!problem) close();
      return problem;
    },
  };
}
