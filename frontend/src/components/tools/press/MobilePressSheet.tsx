import { MessagesSquare, X } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { useOverlayFocusEscape } from '../../../hooks/useOverlayFocusEscape';
import { cx } from '../../../utils/cx';
import chromeStyles from '../../ui/SidebarChrome.module.css';
import { PressSection, type PressSectionProps } from '../PressSection';
import styles from './MobilePressSheet.module.css';

/** Coordinates open state, mutual exclusion with the Tools drawer, and focus return for the phone Press sheet. */
export function useMobilePressSheet({
  isCompact,
  pressGameId,
  toolsDrawerOpen,
  closeToolsDrawer,
}: {
  isCompact: boolean;
  pressGameId: string | null;
  toolsDrawerOpen: boolean;
  closeToolsDrawer: () => void;
}) {
  const pressToggleRef = useRef<HTMLButtonElement | null>(null);
  const [pressSheetOpen, setPressSheetOpen] = useState(false);

  const pressScopeKey = `${isCompact}:${pressGameId ?? ''}`;
  const [prevPressScopeKey, setPrevPressScopeKey] = useState(pressScopeKey);
  if (prevPressScopeKey !== pressScopeKey) {
    setPrevPressScopeKey(pressScopeKey);
    if (pressSheetOpen) setPressSheetOpen(false);
  }

  const [prevToolsDrawerOpen, setPrevToolsDrawerOpen] =
    useState(toolsDrawerOpen);
  if (prevToolsDrawerOpen !== toolsDrawerOpen) {
    setPrevToolsDrawerOpen(toolsDrawerOpen);
    if (toolsDrawerOpen && pressSheetOpen) setPressSheetOpen(false);
  }

  const openPressSheet = () => {
    if (toolsDrawerOpen) closeToolsDrawer();
    setPressSheetOpen(true);
  };

  const closePressSheet = () => {
    setPressSheetOpen(false);
    pressToggleRef.current?.focus();
  };

  return { pressToggleRef, pressSheetOpen, openPressSheet, closePressSheet };
}

export interface MobilePressSheetProps {
  open: boolean;
  onClose: () => void;
  press: Omit<PressSectionProps, 'visible' | 'variant'>;
}

/**
 * Full-width, full-height slide-up Press sheet on phones so messages, inline recipient chips,
 * and keyboard-aware composer have the entire viewport width instead of living inside the
 * narrow Tools drawer. Kept mounted (inert when shut) so channel and draft persist across map
 * peeks.
 */
export const MobilePressSheet: React.FC<MobilePressSheetProps> = ({
  open,
  onClose,
  press,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useOverlayFocusEscape({
    open,
    focusRef: closeButtonRef,
    onClose,
  });

  return (
    <div
      className={styles.mobilePressLayer}
      data-testid="mobile-press-sheet"
      data-open={open ? 'true' : undefined}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label="Press & Diplomacy"
      inert={!open}
    >
      <div className={chromeStyles.panelHeader} data-surface="sheet">
        <div className={chromeStyles.panelHeaderTitle}>
          <MessagesSquare size={16} className={chromeStyles.panelHeaderIcon} />
          <h3>PRESS &amp; DIPLOMACY</h3>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="press-sheet-close-btn"
          className={cx(
            chromeStyles.sidebarCollapseToggleBtn,
            chromeStyles.panelCloseBtn,
          )}
          onClick={onClose}
          aria-label="Close press"
        >
          <X size={20} />
        </button>
      </div>
      <div className={styles.mobilePressBody}>
        <PressSection
          {...press}
          variant="sheet"
          visible={open}
          onProvincePicked={onClose}
        />
      </div>
    </div>
  );
};
