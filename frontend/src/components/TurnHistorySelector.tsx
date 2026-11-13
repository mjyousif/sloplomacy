import { ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../types/diplomacy';
import { shortTurnLabel } from '../utils/historyHelpers';
import { turnLabel } from '../utils/timerHelpers';

/** "AUS", "ENG" …: the nation chips' labels. */
export const powerCode = (power: Power) =>
  POWER_METADATA[power].shortName.slice(0, 3).toUpperCase();

const LIVE_VALUE = 'live';

export interface PowerFilterChipsProps {
  /** The nation chip picked, or null for every nation. */
  power: Power | null;
  disabled: boolean;
  onSelectPower: (power: Power | null) => void;
}

/** Nation filter chips for narrowing a past turn's orders on the map. */
export const PowerFilterChips: React.FC<PowerFilterChipsProps> = ({
  power,
  disabled,
  onSelectPower,
}) => (
  <fieldset
    className="turn-history-powers"
    aria-label="Nations shown"
    disabled={disabled}
    title={disabled ? 'Filter by nation' : undefined}
  >
    <button
      type="button"
      className={`turn-history-chip ${power === null ? 'active' : ''}`}
      data-testid="turn-history-power"
      data-power="ALL"
      data-active={power === null ? 'true' : undefined}
      aria-pressed={power === null}
      onClick={() => onSelectPower(null)}
    >
      All
    </button>
    {ALL_POWERS.map((p) => (
      <button
        key={p}
        type="button"
        className={`turn-history-chip ${power === p ? 'active' : ''}`}
        data-testid="turn-history-power"
        data-power={p}
        data-active={power === p ? 'true' : undefined}
        aria-pressed={power === p}
        title={`Show only ${POWER_METADATA[p].name}'s orders`}
        style={
          {
            '--chip-color': POWER_METADATA[p].color,
          } as React.CSSProperties
        }
        onClick={() => onSelectPower(power === p ? null : p)}
      >
        {powerCode(p)}
      </button>
    ))}
  </fieldset>
);

export interface TurnHistorySelectorProps {
  entries: TurnHistoryEntry[];
  /** The past turn on the map, or null for the live turn. */
  viewIndex: number | null;
  /** The live turn, e.g. "Spring 1902 Movement". */
  liveLabel: string;
  /** The nation chip picked, or null for every nation. */
  power: Power | null;
  /** Locks turn navigation (for example, while an admin mode is active). */
  locked?: boolean;
  onSelect: (index: number | null) => void;
  onStep: (delta: -1 | 1) => void;
  onSelectPower: (power: Power | null) => void;
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
  power,
  locked = false,
  onSelect,
  onStep,
  onSelectPower,
  onPickedTurn,
}) => {
  if (entries.length === 0) return null;
  const viewingPast = viewIndex !== null;

  const pick = (index: number | null) => {
    onSelect(index);
    if (index !== null) onPickedTurn?.();
  };

  return (
    <section
      className={`turn-history ${viewingPast ? 'viewing-past' : ''}`.trim()}
      aria-label="Turn history"
      data-testid="turn-history"
      data-viewing-past={viewingPast ? 'true' : undefined}
    >
      <div className="turn-history-row">
        <button
          type="button"
          className="turn-history-step"
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
          className="turn-history-select"
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
          className="turn-history-step"
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
            className="turn-history-live"
            data-testid="turn-history-live"
            disabled={locked}
            onClick={() => onSelect(null)}
            title="Back to the current turn"
          >
            Live
          </button>
        ) : (
          <span
            className="turn-history-live-tag"
            title="Showing the current turn"
          >
            Live
          </span>
        )}
      </div>

      {/* Always laid out, so the arrows above never move when a past turn is picked and a
          quick run of clicks on ‹ can't land on a chip. On the live turn it is greyed out. */}
      <PowerFilterChips
        power={power}
        disabled={locked || !viewingPast}
        onSelectPower={onSelectPower}
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
    className="turn-history-pill"
    data-testid="turn-history-pill"
    role="group"
    aria-label={`Showing ${turnLabel(entry)}`}
  >
    <button
      type="button"
      className="turn-history-step"
      onClick={() => onStep(-1)}
      disabled={isOldest}
      aria-label="Previous turn"
    >
      <ChevronLeft size={16} />
    </button>
    <span className="turn-history-pill-label">{shortTurnLabel(entry)}</span>
    <button
      type="button"
      className="turn-history-step"
      onClick={() => onStep(1)}
      aria-label="Next turn"
    >
      <ChevronRight size={16} />
    </button>
    <button
      type="button"
      className="turn-history-live"
      data-testid="turn-history-pill-live"
      onClick={onGoLive}
    >
      Live
    </button>
  </div>
);
