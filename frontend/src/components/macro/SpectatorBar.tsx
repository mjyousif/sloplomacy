import { Eye, LogOut, Plus } from 'lucide-react';
import type React from 'react';
import type { SpectatorControls } from '../../hooks/useSpectate';
import {
  ALL_POWERS,
  type GameParticipant,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './SpectatorBar.module.css';

export interface SpectatorBarProps {
  controls: SpectatorControls;
  /** The power whose units the panel lists. */
  activePower: Power;
  participants?: Record<string, GameParticipant>;
  gameOver: boolean;
  /** Shows another power's units, on this screen only. */
  onSelectPower?: (power: Power) => void;
}

/**
 * Over the order panel while the player watches a match without a seat: which power's units
 * are listed (a flag per power picks another), Claim for that power's seat while it is free,
 * and Leave. Every power's orders stay hidden until the turn resolves.
 */
export const SpectatorBar: React.FC<SpectatorBarProps> = ({
  controls,
  activePower,
  participants,
  gameOver,
  onSelectPower,
}) => {
  const meta = POWER_METADATA[activePower];
  const seatFree = !Object.values(participants ?? {}).some(
    (seat) => seat.power === activePower,
  );
  return (
    <div className={styles.bar} data-testid="spectator-bar">
      <div className={styles.mainRow}>
        <Eye size={14} className={styles.icon} aria-hidden="true" />
        <span className={styles.label}>
          <strong>Watching</strong> · you hold no seat. Orders stay hidden until
          each turn resolves.
        </span>
      </div>
      <div className={styles.controls}>
        <fieldset className={styles.powers}>
          <legend className={styles.legend}>Show units of</legend>
          {ALL_POWERS.map((power) => (
            <button
              key={power}
              type="button"
              className={styles.power}
              data-active={power === activePower ? 'true' : undefined}
              aria-pressed={power === activePower}
              aria-label={`Show ${POWER_METADATA[power].shortName}'s units`}
              title={POWER_METADATA[power].shortName}
              onClick={() => onSelectPower?.(power)}
              style={
                {
                  '--seat-color': POWER_METADATA[power].color,
                } as React.CSSProperties
              }
            >
              <PowerFlag power={power} width={18} height={12} />
            </button>
          ))}
        </fieldset>
        <div className={styles.actions}>
          {seatFree && !gameOver && (
            <button
              type="button"
              className={styles.action}
              data-variant="claim"
              data-testid="spectator-claim"
              onClick={() => controls.onClaimSeat(activePower)}
            >
              <Plus size={12} />
              <span>Claim {meta.shortName}</span>
            </button>
          )}
          <button
            type="button"
            className={styles.action}
            data-testid="spectator-leave"
            onClick={controls.onLeave}
          >
            <LogOut size={12} />
            <span>Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
};
