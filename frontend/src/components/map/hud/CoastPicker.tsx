import type React from 'react';
import type { ProvinceInfo } from '../../../types/diplomacy';
import type { PendingCoastChoice } from '../hooks/useMapInteraction';

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
      className={
        compact ? 'coast-picker-modal unit-docked-bar' : 'coast-picker-modal'
      }
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="coast-picker-title">
        Select Coast for {provinces[choice.target]?.name}:
      </div>
      <div className="coast-picker-buttons">
        {choice.coasts.map((c) => (
          <button key={c} className="coast-btn" onClick={() => onPick(c)}>
            {choice.target}/{c} Coast
          </button>
        ))}
        <button className="coast-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
