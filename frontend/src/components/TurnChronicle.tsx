import { Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../types/diplomacy';
import { turnLabel } from '../utils/timerHelpers';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from './map/hud/IconSelectDropdown';
import { PowerFilterChips, powerCode } from './TurnHistorySelector';

const LIVE_VALUE = 'live';

/** Vector clock-with-clockwise-arrow icon used on the Back to live button. */
function BackToLiveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19.4 17.2 A9 9 0 1 1 19.6 7.2" />
      <path
        d="M17.4 8.5 L21.4 5.9 L20.6 9.4 Z"
        fill="currentColor"
        strokeWidth={1.2}
      />
      <path d="M12 7 V12 L14.8 15.6" />
    </svg>
  );
}

export interface TurnChronicleProps {
  /** The live turn on the board. */
  turn: { season: string; year: number; phase: string };
  /** Resolved turns available to inspect. Empty before the first resolution. */
  entries?: TurnHistoryEntry[];
  /** Currently viewed past turn index, or null for the live turn. */
  viewIndex?: number | null;
  /** Nation filter active on a past turn, or null for all nations. */
  power?: Power | null;
  /** Locks turn navigation (for example, while an admin mode is active). */
  locked?: boolean;
  onSelect?: (index: number | null) => void;
  onStep?: (delta: -1 | 1) => void;
  onSelectPower?: (power: Power | null) => void;
}

/**
 * Unified desktop top-bar turn display and turn-history viewer.
 * Fixed width in all states; uses `IconSelectDropdown` for phase selection and
 * expands downward when clicking the nation filter button.
 */
export const TurnChronicle: React.FC<TurnChronicleProps> = ({
  turn,
  entries = [],
  viewIndex = null,
  power = null,
  locked = false,
  onSelect,
  onStep,
  onSelectPower,
}) => {
  const [trayOpen, setTrayOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trayId = useId();
  const selectId = useId();

  const hasHistory = entries.length > 0;
  const controlsDisabled = locked || !hasHistory;
  const viewedEntry =
    hasHistory && viewIndex !== null ? (entries[viewIndex] ?? null) : null;
  const viewingPast = viewedEntry !== null;
  const expanded = !controlsDisabled && trayOpen;
  const activeFilterColor =
    viewingPast && power ? POWER_METADATA[power].fillColor : null;

  useEffect(() => {
    if (controlsDisabled) setTrayOpen(false);
  }, [controlsDisabled]);

  useEffect(() => {
    if (!trayOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setTrayOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [trayOpen]);

  const liveLabel = turnLabel(turn);

  const options = useMemo<IconSelectOption<string>[]>(
    () => [
      {
        value: LIVE_VALUE,
        label: liveLabel,
        testId: 'turn-history-option-live',
      },
      ...[...entries].reverse().map((entry) => ({
        value: String(entry.index),
        label: turnLabel(entry),
        testId: `turn-history-option-${entry.index}`,
      })),
    ],
    [entries, liveLabel],
  );

  return (
    <div
      ref={rootRef}
      className={`turn-chronicle-history ${expanded ? 'expanded' : ''} ${viewingPast ? 'viewing-past' : ''}`.trim()}
      data-testid="turn-history"
      onBlur={(e) => {
        if (
          e.relatedTarget instanceof Node &&
          !e.currentTarget.contains(e.relatedTarget)
        ) {
          setTrayOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setTrayOpen(false);
        }
      }}
    >
      <div
        className={`turn-chronicle-pill ${viewingPast ? 'viewing-past' : ''}`.trim()}
        data-testid="turn-chronicle-pill"
      >
        <button
          type="button"
          className={`turn-chronicle-filter-btn ${activeFilterColor ? 'has-filter' : ''}`.trim()}
          data-testid="turn-history-filter-toggle"
          disabled={controlsDisabled}
          aria-label={
            viewingPast && power
              ? `Nation filter: ${POWER_METADATA[power].shortName}`
              : 'Filter by nation'
          }
          aria-expanded={expanded}
          aria-controls={expanded ? trayId : undefined}
          title={locked ? 'Locked while in admin mode' : 'Filter by nation'}
          style={
            activeFilterColor
              ? ({
                  '--chip-color': activeFilterColor,
                  borderColor: activeFilterColor,
                } as React.CSSProperties)
              : undefined
          }
          onClick={() => {
            if (!controlsDisabled) setTrayOpen((open) => !open);
          }}
        >
          <Filter size={viewingPast && power ? 10 : 13} />
          {viewingPast && power && (
            <span className="turn-chronicle-filter-code">
              {powerCode(power)}
            </span>
          )}
        </button>

        <div className="turn-chronicle-select-wrap">
          <IconSelectDropdown<string>
            id={selectId}
            testId="turn-history-select"
            value={viewIndex === null ? LIVE_VALUE : String(viewIndex)}
            options={options}
            title={locked ? 'Locked while in admin mode' : undefined}
            disabled={controlsDisabled}
            leadingIcon={<Calendar size={14} className="turn-cal-icon" />}
            hideChevron
            onOpenChange={(open) => {
              if (open) setTrayOpen(false);
            }}
            onChange={(val) => {
              if (val !== null) {
                onSelect?.(val === LIVE_VALUE ? null : Number(val));
              }
            }}
          />
        </div>

        <button
          type="button"
          className="turn-history-step"
          data-testid="turn-history-prev"
          onClick={() => onStep?.(-1)}
          disabled={controlsDisabled || viewIndex === 0}
          aria-label="Previous turn"
          title={locked ? 'Locked while in admin mode' : 'Previous turn'}
        >
          <ChevronLeft size={16} />
        </button>

        <button
          type="button"
          className="turn-history-step"
          data-testid="turn-history-next"
          onClick={() => onStep?.(1)}
          disabled={controlsDisabled || !viewingPast}
          aria-label="Next turn"
          title={locked ? 'Locked while in admin mode' : 'Next turn'}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {viewingPast && (
        <button
          type="button"
          className="turn-chronicle-live-btn"
          data-testid="turn-history-live"
          onClick={() => onSelect?.(null)}
          aria-label="Back to live"
          title="Back to live"
        >
          <BackToLiveIcon size={16} />
        </button>
      )}

      {hasHistory && (
        <div
          id={trayId}
          className={`turn-history-tray-wrap ${expanded ? 'open' : ''}`.trim()}
          data-testid="turn-history-tray"
          inert={!expanded}
        >
          <div
            className={`turn-history-tray ${viewingPast ? 'viewing-past' : ''}`.trim()}
          >
            <div className="turn-history-tray-header">
              <span>Filter by nation</span>
            </div>
            <PowerFilterChips
              power={power}
              disabled={!viewingPast}
              onSelectPower={(nextPower) => onSelectPower?.(nextPower)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
