import {
  Anchor,
  Ban,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MoveRight,
  PlusCircle,
  Shield,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import {
  ALL_HISTORY_ACTIONS,
  type HistoryActionType,
  shortTurnLabel,
  toggleHistoryAction,
  toggleHistoryPower,
} from '../../utils/historyHelpers';
import { turnLabel } from '../../utils/timerHelpers';
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

const LIVE_VALUE = 'live';

export interface PowerFilterChipsProps {
  /** Selected nation filters. Empty means every nation is shown. */
  powers: readonly Power[];
  disabled: boolean;
  onSelectPowers: (powers: Power[]) => void;
  /** Whether to include the leading "All" reset chip (used in the mobile drawer). */
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

export interface TurnHistorySelectorProps {
  entries: TurnHistoryEntry[];
  /** The past turn on the map, or null for the live turn. */
  viewIndex: number | null;
  /** The live turn, e.g. "Spring 1902 Movement". */
  liveLabel: string;
  /** Selected nation filters. Empty draws every nation. */
  powers: readonly Power[];
  /** Locks turn navigation (for example, while an admin mode is active). */
  locked?: boolean;
  onSelect: (index: number | null) => void;
  onStep: (delta: -1 | 1) => void;
  onSelectPowers: (powers: Power[]) => void;
  /** Phone drawer: told when a past turn is picked, so the drawer can get out of the way. */
  onPickedTurn?: () => void;
}

/**
 * The left pane's footer: step through resolved turns, or pick one, to see every nation's
 * orders on the map with how they resolved. Hidden until the game has a resolved turn.
 */
export const TurnHistorySelector: React.FC<TurnHistorySelectorProps> = ({
  entries,
  viewIndex,
  liveLabel,
  powers,
  locked = false,
  onSelect,
  onStep,
  onSelectPowers,
  onPickedTurn,
}) => {
  if (entries.length === 0) return null;
  const viewingPast = viewIndex !== null;
  const viewingAdmin = viewingPast && entries[viewIndex]?.phase === 'Admin';

  const pick = (index: number | null) => {
    onSelect(index);
    if (index !== null) onPickedTurn?.();
  };

  return (
    <section
      className={styles.turnHistory}
      aria-label="Turn history"
      data-testid="turn-history"
      data-viewing-past={viewingPast ? 'true' : undefined}
      data-admin-phase={viewingAdmin ? 'true' : undefined}
    >
      <div className={styles.turnHistoryRow}>
        <button
          type="button"
          className={styles.turnHistoryStep}
          data-testid="turn-history-prev"
          onClick={() => {
            onStep(-1);
            onPickedTurn?.();
          }}
          disabled={locked || viewIndex === 0}
          aria-label="Previous turn"
          title={locked ? 'Locked while in admin mode' : 'Previous turn'}
        >
          <ChevronLeft size={14} />
        </button>
        <select
          className={styles.turnHistorySelect}
          data-testid="turn-history-select"
          aria-label="Turn to show"
          title={locked ? 'Locked while in admin mode' : undefined}
          disabled={locked}
          value={viewIndex === null ? LIVE_VALUE : String(viewIndex)}
          onChange={(e) =>
            pick(e.target.value === LIVE_VALUE ? null : Number(e.target.value))
          }
        >
          <option value={LIVE_VALUE}>{liveLabel}</option>
          {[...entries].reverse().map((entry) => (
            <option key={entry.index} value={String(entry.index)}>
              {turnLabel(entry)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.turnHistoryStep}
          data-testid="turn-history-next"
          onClick={() => onStep(1)}
          disabled={locked || !viewingPast}
          aria-label="Next turn"
          title={locked ? 'Locked while in admin mode' : 'Next turn'}
        >
          <ChevronRight size={14} />
        </button>
        {viewingPast ? (
          <button
            type="button"
            className={styles.turnHistoryLive}
            data-testid="turn-history-live"
            disabled={locked}
            onClick={() => onSelect(null)}
            title="Back to the current turn"
          >
            Live
          </button>
        ) : (
          <span
            className={styles.turnHistoryLiveTag}
            title="Showing the current turn"
          >
            Live
          </span>
        )}
      </div>

      {/* Always laid out, so the arrows above never move when a past turn is picked and a
          quick run of clicks on ‹ can't land on a chip. On the live turn it is greyed out. */}
      <PowerFilterChips
        powers={powers}
        disabled={locked || !viewingPast}
        onSelectPowers={onSelectPowers}
      />
    </section>
  );
};

export interface TurnHistoryPillProps {
  entry: TurnHistoryEntry;
  isOldest: boolean;
  onStep: (delta: -1 | 1) => void;
  onGoLive: () => void;
}

/** Phone only: sits on the map while a past turn is shown, since the drawer closes on pick. */
export const TurnHistoryPill: React.FC<TurnHistoryPillProps> = ({
  entry,
  isOldest,
  onStep,
  onGoLive,
}) => (
  <div
    className={styles.turnHistoryPill}
    data-testid="turn-history-pill"
    data-admin-phase={entry.phase === 'Admin' ? 'true' : undefined}
    role="group"
    aria-label={`Showing ${turnLabel(entry)}`}
  >
    <button
      type="button"
      className={styles.turnHistoryStep}
      onClick={() => onStep(-1)}
      disabled={isOldest}
      aria-label="Previous turn"
    >
      <ChevronLeft size={16} />
    </button>
    <span className={styles.turnHistoryPillLabel}>{shortTurnLabel(entry)}</span>
    <button
      type="button"
      className={styles.turnHistoryStep}
      onClick={() => onStep(1)}
      aria-label="Next turn"
    >
      <ChevronRight size={16} />
    </button>
    <button
      type="button"
      className={styles.turnHistoryLive}
      data-testid="turn-history-pill-live"
      onClick={onGoLive}
    >
      Live
    </button>
  </div>
);
