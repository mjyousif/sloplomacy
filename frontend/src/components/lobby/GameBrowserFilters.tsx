import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ALL_POWERS } from '../../types/diplomacy';
import {
  activeFilterCount,
  BROWSE_SEASONS,
  type BrowseFilters,
  type BrowseSeason,
  DEFAULT_BROWSE_FILTERS,
  FIRST_YEAR,
  hasActiveFilters,
  parseYear,
  type SeatFilter,
  type TurnOp,
  toggleCountry,
} from '../../utils/lobbyBrowse';
import {
  accessiblePowerColor,
  powerCode,
  powerShortName,
} from '../../utils/powerHelpers';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './GameBrowserFilters.module.css';

const SEAT_OPTIONS: { value: SeatFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'full', label: 'Full' },
  { value: 'all', label: 'All' },
];

export interface GameBrowserFiltersProps {
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
}

/** The browser's toolbar: open or full games, countries still free, and the turn. */
export const GameBrowserFilters: React.FC<GameBrowserFiltersProps> = ({
  filters,
  onChange,
}) => {
  const set = (patch: Partial<BrowseFilters>) =>
    onChange({ ...filters, ...patch });

  // Phone collapses the multi-row filter toolbar behind a single toggle bar until tapped.
  const [expandedOnCompact, setExpandedOnCompact] = useState(false);
  const activeCount = activeFilterCount(filters);

  // The year as typed: "19" is on its way to 1903, so it can't live in the filters.
  const [yearText, setYearText] = useState(filters.year?.toString() ?? '');
  if (filters.year === null && parseYear(yearText) !== null) {
    setYearText(''); // the filters were cleared
  }
  const typeYear = (text: string) => {
    setYearText(text);
    const year = parseYear(text);
    if (year !== filters.year) set({ year });
  };

  return (
    <div className={styles.filters} data-testid="browser-filters">
      <div className={styles.compactToggleRow}>
        <button
          type="button"
          className={styles.toggleBtn}
          data-testid="browser-filters-toggle"
          aria-expanded={expandedOnCompact}
          onClick={() => setExpandedOnCompact((open) => !open)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>
            {activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
          </span>
          <ChevronDown
            size={14}
            className={styles.toggleChevron}
            data-open={expandedOnCompact ? 'true' : undefined}
            aria-hidden="true"
          />
        </button>
        {activeCount > 0 && !expandedOnCompact && (
          <button
            type="button"
            className={styles.quickClear}
            data-testid="browser-filters-quick-clear"
            onClick={() => onChange(DEFAULT_BROWSE_FILTERS)}
          >
            <X size={12} aria-hidden="true" />
            <span>Clear</span>
          </button>
        )}
      </div>

      <div
        className={styles.filtersBody}
        data-testid="browser-filters-body"
        data-open={expandedOnCompact ? 'true' : undefined}
      >
        <div className={styles.row}>
          <fieldset className={styles.segment} aria-label="Seats">
            {SEAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={filters.seats === opt.value}
                data-active={filters.seats === opt.value}
                onClick={() => set({ seats: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </fieldset>

          <fieldset className={styles.countries} aria-label="Countries open">
            <span className={styles.label}>Countries open</span>
            {ALL_POWERS.map((power) => {
              const on = filters.countries.includes(power);
              return (
                <button
                  key={power}
                  type="button"
                  aria-pressed={on}
                  title={`${powerShortName(power)} must be unclaimed`}
                  className={styles.chip}
                  data-active={on}
                  style={
                    on
                      ? { borderColor: accessiblePowerColor(power) }
                      : undefined
                  }
                  onClick={() =>
                    set({ countries: toggleCountry(filters.countries, power) })
                  }
                >
                  <PowerFlag power={power} width={16} height={11} />
                  <span>{powerCode(power)}</span>
                </button>
              );
            })}
          </fieldset>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Turn</span>
          <select
            aria-label="Turn comparison"
            className={styles.field}
            value={filters.turnOp ?? ''}
            onChange={(e) =>
              set({ turnOp: (e.target.value || null) as TurnOp | null })
            }
          >
            <option value="">Any turn</option>
            <option value="at">At</option>
            <option value="before">Before</option>
            <option value="after">After</option>
          </select>
          <select
            aria-label="Turn season"
            className={styles.field}
            value={filters.season ?? ''}
            disabled={!filters.turnOp}
            onChange={(e) =>
              set({ season: (e.target.value || null) as BrowseSeason | null })
            }
          >
            <option value="">Any season</option>
            {BROWSE_SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            aria-label="Turn year"
            type="number"
            min={FIRST_YEAR}
            placeholder="Year"
            className={styles.field}
            data-field="year"
            disabled={!filters.turnOp}
            value={yearText}
            onChange={(e) => typeYear(e.target.value)}
          />
          {hasActiveFilters(filters) && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => onChange(DEFAULT_BROWSE_FILTERS)}
            >
              <X size={12} />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
