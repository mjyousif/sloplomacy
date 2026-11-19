import {
  Anchor,
  Ban,
  Crosshair,
  MoveRight,
  PlusCircle,
  Shield,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { ALL_POWERS, POWER_METADATA, type Power } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import {
  ALL_HISTORY_ACTIONS,
  type HistoryActionType,
  toggleHistoryAction,
  toggleHistoryPower,
} from '../../utils/historyHelpers';
import styles from './TurnHistorySelector.module.css';

/** "AUS", "ENG" …: the nation chips' labels. */
export const powerCode = (power: Power) =>
  POWER_METADATA[power].shortName.slice(0, 3).toUpperCase();

/** Lift very dark map colors (England navy, Germany charcoal) so chip borders stay readable on dark UI panels. */
function chipColorForPower(power: Power): string {
  if (power === 'ENGLAND') return '#4f7fd8';
  if (power === 'GERMANY') return '#8c96a6';
  return POWER_METADATA[power].color;
}

export interface PowerFilterChipsProps {
  /** Selected nation filters. Empty means every nation is shown. */
  powers: readonly Power[];
  disabled: boolean;
  onSelectPowers: (powers: Power[]) => void;
  /** Whether to include the leading "All" reset chip. */
  showAllChip?: boolean;
  className?: string;
  chipClassName?: string;
}

/** Nation filter chips for narrowing a past turn's orders on the map and sidebar. */
export const PowerFilterChips: React.FC<PowerFilterChipsProps> = ({
  powers,
  disabled,
  onSelectPowers,
  showAllChip = true,
  className,
  chipClassName,
}) => (
  <fieldset
    className={cx(styles.turnHistoryPowers, className)}
    aria-label="Nations shown"
    disabled={disabled}
    title={disabled ? 'Filter by nation' : undefined}
  >
    {showAllChip && (
      <button
        type="button"
        className={cx(styles.turnHistoryChip, chipClassName)}
        data-testid="turn-history-power"
        data-power="ALL"
        data-active={powers.length === 0 ? 'true' : undefined}
        aria-pressed={powers.length === 0}
        onClick={() => onSelectPowers([])}
      >
        All
      </button>
    )}
    {ALL_POWERS.map((p) => {
      const selected = powers.includes(p);
      return (
        <button
          key={p}
          type="button"
          className={cx(styles.turnHistoryChip, chipClassName)}
          data-testid="turn-history-power"
          data-power={p}
          data-active={selected ? 'true' : undefined}
          aria-pressed={selected}
          title={
            selected
              ? `Remove ${POWER_METADATA[p].name} from filter`
              : `Include ${POWER_METADATA[p].name} in filter`
          }
          style={
            {
              '--chip-color': chipColorForPower(p),
            } as React.CSSProperties
          }
          onClick={() => onSelectPowers(toggleHistoryPower(powers, p))}
        >
          {powerCode(p)}
        </button>
      );
    })}
  </fieldset>
);

const ACTION_META: Record<
  HistoryActionType,
  { label: string; Icon: React.FC<{ size?: number }> }
> = {
  HOLD: { label: 'Hold', Icon: Shield },
  SUPPORT: { label: 'Support', Icon: Crosshair },
  CONVOY: { label: 'Convoy', Icon: Anchor },
  MOVE: { label: 'Move', Icon: MoveRight },
  BUILD: { label: 'Build', Icon: PlusCircle },
  DISBAND: { label: 'Disband', Icon: Trash2 },
  WAIVE: { label: 'Waive', Icon: Ban },
};

export interface ActionFilterChipsProps {
  /** Selected actions. Empty means every action type for the phase is shown. */
  actions: readonly HistoryActionType[];
  /** Action types available in the current phase (defaults to Movement actions). */
  availableActions?: readonly HistoryActionType[];
  onSelectActions: (actions: HistoryActionType[]) => void;
  className?: string;
  chipClassName?: string;
}

/** Phase-aware action filter chips for narrowing a past Movement or Adjustments turn on the map and sidebar. */
export const ActionFilterChips: React.FC<ActionFilterChipsProps> = ({
  actions,
  availableActions = ALL_HISTORY_ACTIONS,
  onSelectActions,
  className,
  chipClassName,
}) => (
  <fieldset
    className={cx(styles.turnHistoryPowers, className)}
    aria-label="Turn actions shown"
  >
    {availableActions.map((action) => {
      const selected = actions.includes(action);
      const { label, Icon } = ACTION_META[action];
      return (
        <button
          key={action}
          type="button"
          className={cx(
            styles.turnHistoryChip,
            styles.turnHistoryActionChip,
            chipClassName,
          )}
          data-testid="turn-history-action"
          data-action={action}
          data-active={selected ? 'true' : undefined}
          aria-pressed={selected}
          onClick={() =>
            onSelectActions(
              toggleHistoryAction(actions, action, availableActions),
            )
          }
        >
          <Icon size={11} />
          <span>{label}</span>
        </button>
      );
    })}
  </fieldset>
);
