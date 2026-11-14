import { useCallback, useEffect, useState } from 'react';

/**
 * Remembers whether the selected unit was picked on the sidebar. The sidebar card already holds
 * the unit's order controls, so a unit picked there gets no menu over the map, only the map's
 * highlights. A unit picked on the map still shows its menu, and the sidebar highlights its card
 * either way: the selection itself is the one `selectedUnitId` everyone shares.
 */
export function useSidebarSelection(
  selectedUnitId: string | null,
  setSelectedUnitId: (unitId: string | null) => void,
) {
  const [sidebarPickedId, setSidebarPickedId] = useState<string | null>(null);

  // A different unit, or none, ends the sidebar's pick, so the same unit chosen again by any
  // other route (the map, an issue link) is not treated as one.
  useEffect(() => {
    if (sidebarPickedId !== null && sidebarPickedId !== selectedUnitId) {
      setSidebarPickedId(null);
    }
  }, [selectedUnitId, sidebarPickedId]);

  const selectFromSidebar = useCallback(
    (unitId: string | null) => {
      setSidebarPickedId(unitId);
      setSelectedUnitId(unitId);
    },
    [setSelectedUnitId],
  );
  const selectFromMap = useCallback(
    (unitId: string | null) => {
      setSidebarPickedId(null);
      setSelectedUnitId(unitId);
    },
    [setSelectedUnitId],
  );

  return {
    selectFromSidebar,
    selectFromMap,
    suppressUnitMenu:
      selectedUnitId !== null && sidebarPickedId === selectedUnitId,
  };
}
