import { Megaphone } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type GameParticipant,
  POWER_METADATA,
  type Power,
} from '../../../types/diplomacy';
import { threadKey } from '../../../utils/pressHelpers';
import { PowerFlag } from '../../ui/PowerFlag';
import styles from './PressRecipientBar.module.css';

export interface PressRecipientBarProps {
  viewer: Power;
  recipients: Power[];
  participants?: Record<string, GameParticipant>;
  unreadByThread: Record<string, number>;
  onSelectPublic: () => void;
  onTogglePower: (power: Power) => void;
}

/**
 * Inline recipient picker for the full-width mobile Press sheet so players can switch between
 * Public and any 1-to-1 or multi-power private thread directly inside Press without opening the
 * Tools drawer.
 */
export const PressRecipientBar: React.FC<PressRecipientBarProps> = ({
  viewer,
  recipients,
  participants,
  unreadByThread,
  onSelectPublic,
  onTogglePower,
}) => {
  const others = ALL_POWERS.filter((power) => power !== viewer);
  const isPublic = recipients.length === 0;

  return (
    <div
      className={styles.recipientBar}
      role="group"
      aria-label="Recipients"
      data-testid="press-recipient-bar"
    >
      <span className={styles.recipientLabel}>To:</span>
      <button
        type="button"
        className={styles.recipientChip}
        data-testid="press-recipient-public"
        data-active={isPublic ? 'true' : undefined}
        aria-pressed={isPublic}
        onClick={onSelectPublic}
      >
        <Megaphone size={12} aria-hidden="true" />
        <span>Public</span>
      </button>
      {others.map((power) => {
        const meta = POWER_METADATA[power];
        const picked = recipients.includes(power);
        const vacant = participants !== undefined && !participants[power];
        const unread = unreadByThread[threadKey([viewer, power])] ?? 0;
        const label = vacant
          ? `${meta.shortName} has no player to write to`
          : picked
            ? `Stop sending privately to ${meta.shortName}`
            : `Send privately to ${meta.shortName}`;

        return (
          <button
            key={power}
            type="button"
            className={styles.recipientChip}
            data-testid={`press-recipient-${power}`}
            data-active={picked ? 'true' : undefined}
            aria-pressed={picked}
            aria-label={unread ? `${label}, ${unread} unread` : label}
            title={label}
            disabled={vacant && !picked}
            style={picked ? { borderColor: meta.color } : undefined}
            onClick={() => onTogglePower(power)}
          >
            <PowerFlag
              power={power}
              width={16}
              height={11}
              aria-hidden="true"
            />
            <span>{meta.shortName.slice(0, 3).toUpperCase()}</span>
            {unread > 0 && (
              <span
                className={styles.chipUnread}
                data-testid="press-pick-unread"
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
