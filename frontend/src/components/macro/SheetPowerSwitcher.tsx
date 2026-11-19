import { CheckCircle2 } from 'lucide-react';
import type React from 'react';
import { ALL_POWERS, POWER_METADATA, type Power } from '../../types/diplomacy';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './SheetPowerSwitcher.module.css';

export interface SheetPowerSwitcherProps {
  activePower: Power;
  finalizedPowers: Power[];
  onSelectPower: (power: Power) => void;
  onClose: () => void;
}

/**
 * 1-tap 7-power switcher rendered inside the phone order sheet peek during Solo Sandbox or
 * Multiplayer Hypothetical Mode.
 */
export const SheetPowerSwitcher: React.FC<SheetPowerSwitcherProps> = ({
  activePower,
  finalizedPowers,
  onSelectPower,
  onClose,
}) => (
  <div
    className={styles.switcherGrid}
    role="listbox"
    aria-label="Switch commanded power"
    data-testid="sheet-power-switcher-popover"
    onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }}
  >
    {ALL_POWERS.map((power) => {
      const meta = POWER_METADATA[power];
      const isActive = power === activePower;
      const isFinalized = finalizedPowers.includes(power);
      return (
        <button
          key={power}
          type="button"
          role="option"
          aria-selected={isActive}
          aria-label={meta.shortName}
          data-testid={`sheet-power-option-${power}`}
          data-active={isActive ? 'true' : undefined}
          className={styles.switcherOption}
          style={
            isActive
              ? { borderColor: meta.color, background: meta.lightBg }
              : undefined
          }
          onClick={() => {
            onSelectPower(power);
            onClose();
          }}
        >
          <PowerFlag power={power} width={20} height={13} />
          <span className={styles.switcherCode}>
            {meta.shortName.slice(0, 3).toUpperCase()}
          </span>
          {isFinalized && (
            <CheckCircle2
              size={10}
              className={styles.switcherDone}
              aria-hidden="true"
            />
          )}
        </button>
      );
    })}
  </div>
);
