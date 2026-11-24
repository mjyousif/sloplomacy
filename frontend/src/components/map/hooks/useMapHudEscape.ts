import { useEffect, useRef } from 'react';

export interface MapHudDismissOptions {
  directEditActive: boolean;
  hasDirectEditCoastChoice: boolean;
  onCancelDirectEditCoast: () => void;
  hasCoastChoice: boolean;
  onCancelCoast: () => void;
  hasUnitOrBuildMenu: boolean;
  onClearSelection: () => void;
}

/** Picks the topmost open map HUD layer's dismiss callback, or `null` when none is open. */
export function resolveMapHudDismiss({
  directEditActive,
  hasDirectEditCoastChoice,
  onCancelDirectEditCoast,
  hasCoastChoice,
  onCancelCoast,
  hasUnitOrBuildMenu,
  onClearSelection,
}: MapHudDismissOptions): (() => void) | null {
  if (directEditActive) {
    return hasDirectEditCoastChoice ? onCancelDirectEditCoast : null;
  }
  if (hasCoastChoice) return onCancelCoast;
  if (hasUnitOrBuildMenu) return onClearSelection;
  return null;
}

/**
 * Dismisses the topmost active map HUD menu (`CoastPicker`, `BuildMenu`, or `UnitMenu`) on
 * `Escape`. Listens on `window` in bubble phase so higher-priority `Modal` (`window` capture)
 * and `useDismissableLayer` (`document` + `stopPropagation`) layers intercept `Escape` first.
 */
export function useMapHudEscape(onDismiss: (() => void) | null): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const active = Boolean(onDismiss);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismissRef.current?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);
}
