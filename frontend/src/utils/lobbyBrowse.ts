import type { Power } from '../types/diplomacy';

/** Pure helpers for the lobby's game browser (`GET /api/games/browse`). */

export type SeatFilter = 'open' | 'full' | 'all';
export type TurnOp = 'at' | 'before' | 'after';
export type BrowseSeason = 'Spring' | 'Fall' | 'Winter';

export interface BrowseFilters {
  seats: SeatFilter;
  /** Powers that must all still be unclaimed. */
  countries: Power[];
  turnOp: TurnOp | null;
  /** Without a season the turn filter compares years only. */
  season: BrowseSeason | null;
  year: number | null;
}

export const BROWSE_PAGE_SIZE = 10;
export const FIRST_YEAR = 1901;
export const BROWSE_SEASONS: BrowseSeason[] = ['Spring', 'Fall', 'Winter'];

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = {
  seats: 'open',
  countries: [],
  turnOp: null,
  season: null,
  year: null,
};

/** The query string for one page. A turn filter is sent only once it has a year. */
export function browseQuery(filters: BrowseFilters, page: number): string {
  const params = new URLSearchParams({
    seats: filters.seats,
    page: String(page),
    page_size: String(BROWSE_PAGE_SIZE),
  });
  if (filters.countries.length > 0) {
    params.set('countries', filters.countries.join(','));
  }
  if (filters.turnOp && filters.year !== null) {
    params.set('turn_op', filters.turnOp);
    params.set('year', String(filters.year));
    if (filters.season) params.set('season', filters.season);
  }
  return params.toString();
}

export function hasActiveFilters(filters: BrowseFilters): boolean {
  return browseQuery(filters, 1) !== browseQuery(DEFAULT_BROWSE_FILTERS, 1);
}

export function pageCount(total: number, pageSize = BROWSE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Adds the power, or removes it if it is already chosen, keeping the given order. */
export function toggleCountry(chosen: Power[], power: Power): Power[] {
  return chosen.includes(power)
    ? chosen.filter((p) => p !== power)
    : [...chosen, power];
}

/** A year typed into the turn filter: a whole number from 1901, or nothing. */
export function parseYear(raw: string): number | null {
  const year = Number.parseInt(raw, 10);
  return Number.isFinite(year) && year >= FIRST_YEAR ? year : null;
}

const PHASE_SHORT: Record<string, string> = {
  Movement: 'Moves',
  Retreats: 'Retreats',
  Adjustments: 'Builds',
};

/** "F1903 Moves": short enough for a row, with the full turn in a title. */
export function shortTurn(season: string, year: number, phase: string): string {
  return `${season.charAt(0)}${year} ${PHASE_SHORT[phase] ?? phase}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12m ago", "5h ago", "3d ago", then a date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const ago = Math.max(0, now - then);
  if (ago < MINUTE) return 'just now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d ago`;
  return shortDate(iso, now);
}

/** "Nov 3", with the year added when it is not this year. */
export function shortDate(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
