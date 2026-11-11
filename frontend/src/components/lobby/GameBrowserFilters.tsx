import { X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ALL_POWERS, POWER_METADATA } from '../../types/diplomacy';
import {
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
import { PowerFlag } from '../PowerFlag';

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
    <div className="browser-filters" data-testid="browser-filters">
      <div className="browser-filter-row">
        <fieldset className="browser-seg" aria-label="Seats">
          {SEAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={filters.seats === opt.value}
              className={filters.seats === opt.value ? 'active' : ''}
              onClick={() => set({ seats: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </fieldset>

        <fieldset className="browser-countries" aria-label="Countries open">
          <span className="browser-filter-label">Countries open</span>
          {ALL_POWERS.map((power) => {
            const on = filters.countries.includes(power);
            const meta = POWER_METADATA[power];
            return (
              <button
                key={power}
                type="button"
                aria-pressed={on}
                title={`${meta.shortName} must be unclaimed`}
                className={`browser-country-chip ${on ? 'active' : ''}`}
                style={on ? { borderColor: meta.color } : undefined}
                onClick={() =>
                  set({ countries: toggleCountry(filters.countries, power) })
                }
              >
                <PowerFlag power={power} width={16} height={11} />
                <span>{meta.shortName.slice(0, 3).toUpperCase()}</span>
              </button>
            );
          })}
        </fieldset>
      </div>

      <div className="browser-filter-row">
        <span className="browser-filter-label">Turn</span>
        <select
          aria-label="Turn comparison"
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
          className="browser-year-input"
          disabled={!filters.turnOp}
          value={yearText}
          onChange={(e) => typeYear(e.target.value)}
        />
        {hasActiveFilters(filters) && (
          <button
            type="button"
            className="browser-clear-btn"
            onClick={() => onChange(DEFAULT_BROWSE_FILTERS)}
          >
            <X size={12} />
            <span>Clear filters</span>
          </button>
        )}
      </div>
    </div>
  );
};
