import type React from 'react';
import type { Power } from '../../types/diplomacy';
import type { OrderProgress } from '../../utils/orderProgress';
import type { SheetSnap } from '../../utils/sheetHelpers';
import styles from '../MacroSidebar.module.css';
import { BottomSheet } from '../ui/BottomSheet';
import { PowerHeader } from './PowerHeader';

export interface MacroOrderSheetProps {
  sheetSnap: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  activePower: Power;
  powerColor: string;
  progress: OrderProgress;
  isSurrendered: boolean;
  isFinalized: boolean;
  locked: boolean;
  lockBar: React.ReactNode;
  clearAllButton: React.ReactNode;
  footerActions: React.ReactNode;
  phaseContext: React.ReactNode;
  unitList: React.ReactNode;
  sheetBodyRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The phone's pull-up order sheet: its peek holds the power, Clear All and Finalize, and its
 * scrollable body holds the phase context and unit cards.
 */
export const MacroOrderSheet: React.FC<MacroOrderSheetProps> = ({
  sheetSnap,
  onSheetSnapChange,
  activePower,
  powerColor,
  progress,
  isSurrendered,
  isFinalized,
  locked,
  lockBar,
  clearAllButton,
  footerActions,
  phaseContext,
  unitList,
  sheetBodyRef,
}) => (
  <BottomSheet
    snap={sheetSnap}
    onSnapChange={(snap) => onSheetSnapChange?.(snap)}
    label="Orders"
    testId="macro-sidebar"
    peek={
      <div
        className={styles.macroSheetPeek}
        data-testid="macro-sheet-peek"
        data-history-locked={locked ? 'true' : undefined}
        style={{ borderLeftColor: powerColor }}
      >
        {lockBar}
        <PowerHeader
          variant="sheet"
          activePower={activePower}
          progress={progress}
          isSurrendered={isSurrendered}
          isFinalized={isFinalized}
          locked={locked}
        />
        <div
          className={styles.macroSheetControls}
          data-testid="macro-sheet-controls"
          inert={locked || undefined}
        >
          {clearAllButton}
          {footerActions}
        </div>
      </div>
    }
  >
    <div
      className={styles.macroSheetBody}
      data-testid="macro-sheet-body"
      data-history-locked={locked ? 'true' : undefined}
      ref={sheetBodyRef}
      inert={locked || isSurrendered || undefined}
    >
      {phaseContext}
      <div
        className={styles.macroUnitsScrollArea}
        data-testid="macro-units-scroll-area"
      >
        {unitList}
      </div>
    </div>
  </BottomSheet>
);
