import type React from 'react';
import { ALL_POWERS, POWER_METADATA, type Power } from '../../types/diplomacy';
import { PowerFlag } from '../PowerFlag';
import styles from './PowerPicker.module.css';

export interface PowerPickerProps {
  selected: Power;
  onSelect: (power: Power) => void;
}

/** One flag button per Great Power, with the chosen one highlighted. */
export const PowerPicker: React.FC<PowerPickerProps> = ({
  selected: selectedPower,
  onSelect,
}) => {
  return (
    <div className={styles.createPowerPicker}>
      {ALL_POWERS.map((pwr) => {
        const meta = POWER_METADATA[pwr];
        const selected = selectedPower === pwr;
        return (
          <button
            key={pwr}
            type="button"
            onClick={() => onSelect(pwr)}
            data-selected={selected ? 'true' : undefined}
            className={styles.createPowerOption}
            style={{
              borderColor: selected ? meta.color : undefined,
              backgroundColor: selected ? meta.lightBg : undefined,
            }}
          >
            <PowerFlag power={pwr} width={22} height={15} />
            <span>{meta.shortName}</span>
          </button>
        );
      })}
    </div>
  );
};
