import type React from 'react';
import type { ProvinceInfo } from '../../../types/diplomacy';
import { cx } from '../../../utils/cx';
import type { PendingCoastChoice } from '../hooks/useMapInteraction';
import styles from './CoastPicker.module.css';
import floatingStyles from './FloatingMenu.module.css';

interface CoastPickerProps {
  compact: boolean;
  /** Docks the picker as the phone's bottom bar. */
  dockRef: React.Ref<HTMLDivElement>;
  provinces: Record<string, ProvinceInfo>;
  choice: PendingCoastChoice;
  onPick: (coast: string) => void;
  onCancel: () => void;
}

/** Which coast of a split-coast province a fleet is moving or retreating to. */
export function CoastPicker({
  compact,
  dockRef,
  provinces,
  choice,
  onPick,
  onCancel,
}: CoastPickerProps) {
  return (
    <div
      ref={compact ? dockRef : undefined}
      className={cx(
        styles.coastPickerModal,
        compact && floatingStyles.dockedBar,
      )}
      data-testid="coast-picker"
      data-docked={compact ? 'true' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.coastPickerTitle}>
        Select Coast for {provinces[choice.target]?.name}:
      </div>
      <div className={styles.coastPickerButtons}>
        {choice.coasts.map((c) => (
          <button key={c} className={styles.coastBtn} onClick={() => onPick(c)}>
            {choice.target}/{c} Coast
          </button>
        ))}
        <button className={styles.coastCancelBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
