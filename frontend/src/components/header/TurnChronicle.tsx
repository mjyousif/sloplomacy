import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type React from 'react';
import { useId, useMemo, useState } from 'react';
import type { TurnHistoryEntry } from '../../types/diplomacy';
import { turnLabel } from '../../utils/timerHelpers';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from '../map/hud/IconSelectDropdown';
import styles from './TurnChronicle.module.css';

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
  /** Locks turn navigation (for example, while an admin mode is active). */
  locked?: boolean;
  onSelect?: (index: number | null) => void;
  onStep?: (delta: -1 | 1) => void;
}

/**
 * Unified desktop top-bar turn display and turn-history viewer.
 * Places step arrows to the left of the fixed-width dropdown and shows an
 * adjacent Back to live icon button to the right when viewing a resolved turn.
 */
export const TurnChronicle: React.FC<TurnChronicleProps> = ({
  turn,
  entries = [],
  viewIndex = null,
  locked = false,
  onSelect,
  onStep,
}) => {
  const selectId = useId();

  const hasHistory = entries.length > 0;
  const controlsDisabled = locked || !hasHistory;
  const viewedEntry =
    hasHistory && viewIndex !== null ? (entries[viewIndex] ?? null) : null;
  const viewingPast = viewedEntry !== null;
  const viewingAdmin = viewedEntry?.phase === 'Admin';

  const liveLabel = turnLabel(turn);
  const renderTurnContent = (season: string, year: number, phase: string) => (
    <>
      <span>
        {season} {year}
      </span>{' '}
      <span className={styles.turnPhaseLabel} data-testid="turn-phase-label">
        {phase === 'Admin' ? '— Admin Edit' : phase}
      </span>
    </>
  );
  const currentKey =
    viewIndex === null ? `live:${liveLabel}` : `past:${viewIndex}`;
  const currentPos = viewIndex ?? entries.length;
  const [turnTransition, setTurnTransition] = useState<{
    key: string;
    pos: number;
    dir: 'back' | 'forward' | null;
  }>({ key: currentKey, pos: currentPos, dir: null });

  if (currentKey !== turnTransition.key) {
    setTurnTransition({
      key: currentKey,
      pos: currentPos,
      dir: currentPos < turnTransition.pos ? 'back' : 'forward',
    });
  }

  const options = useMemo<IconSelectOption<string>[]>(
    () => [
      {
        value: LIVE_VALUE,
        label: liveLabel,
        content: renderTurnContent(turn.season, turn.year, turn.phase),
        testId: 'turn-history-option-live',
      },
      ...[...entries].reverse().map((entry) => ({
        value: String(entry.index),
        label: turnLabel(entry),
        content: renderTurnContent(entry.season, entry.year, entry.phase),
        testId: `turn-history-option-${entry.index}`,
      })),
    ],
    [entries, liveLabel, turn.season, turn.year, turn.phase],
  );

  return (
    <div
      className={styles.turnChronicleHistory}
      data-testid="turn-history"
      data-viewing-past={viewingPast ? 'true' : undefined}
      data-turn-dir={turnTransition.dir ?? undefined}
    >
      <div
        className={styles.turnChroniclePill}
        data-testid="turn-chronicle-pill"
        data-viewing-past={viewingPast ? 'true' : undefined}
        data-admin-phase={viewingAdmin ? 'true' : undefined}
      >
        <button
          type="button"
          className={styles.chronicleStep}
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
          className={styles.chronicleStep}
          data-testid="turn-history-next"
          onClick={() => onStep?.(1)}
          disabled={controlsDisabled || !viewingPast}
          aria-label="Next turn"
          title={locked ? 'Locked while in admin mode' : 'Next turn'}
        >
          <ChevronRight size={16} />
        </button>

        <div className={styles.turnChronicleSelectWrap}>
          <IconSelectDropdown<string>
            id={selectId}
            testId="turn-history-select"
            value={viewIndex === null ? LIVE_VALUE : String(viewIndex)}
            options={options}
            title={locked ? 'Locked while in admin mode' : undefined}
            disabled={controlsDisabled}
            leadingIcon={<Calendar size={14} className={styles.turnCalIcon} />}
            hideChevron
            animateValueChange
            classNames={{
              root: styles.dropdownRoot,
              trigger: styles.dropdownTrigger,
              leading: styles.dropdownLeading,
              value: styles.dropdownValue,
              valueText: styles.dropdownValueText,
              menu: styles.dropdownMenu,
              option: styles.dropdownOption,
            }}
            onChange={(val) => {
              if (val !== null) {
                onSelect?.(val === LIVE_VALUE ? null : Number(val));
              }
            }}
          />
        </div>
      </div>

      {viewingPast && (
        <button
          type="button"
          className={styles.turnChronicleLiveBtn}
          data-testid="turn-history-live"
          data-admin-phase={viewingAdmin ? 'true' : undefined}
          onClick={() => onSelect?.(null)}
          aria-label="Back to live"
          title="Back to live"
        >
          <BackToLiveIcon size={16} />
        </button>
      )}
    </div>
  );
};
