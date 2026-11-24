import type { ProvinceInfo, UnitType } from '../types/diplomacy';

export interface TurnLike {
  season: string;
  year: number;
  phase: string;
}

/** Same phase of the same year, so a turn can be matched across lists and snapshots. */
export function sameTurn(a: TurnLike, b: TurnLike): boolean {
  return a.season === b.season && a.year === b.year && a.phase === b.phase;
}

/** Identifies a turn to the server and turn-log UI, formatting Admin snapshots specially. */
export function turnLabel(turn: TurnLike): string {
  if (turn.phase === 'Admin') {
    return `${turn.season} ${turn.year} — Admin Edit`;
  }
  return `${turn.season} ${turn.year} ${turn.phase}`;
}

/** Compact display turn label with middot separator (e.g. `"Spring 1901 · Movement"`). */
export function turnMiddotLabel(turn: TurnLike): string {
  return `${turn.season} ${turn.year} · ${turn.phase}`;
}

/** Full province name from map metadata, falling back to the province code (or `''` if empty). */
export function provinceName(
  provinces: Record<string, ProvinceInfo> | undefined,
  code: string | null | undefined,
): string {
  if (!code) return '';
  return provinces?.[code]?.name ?? code;
}

/** Human-readable unit type word (`"Army"` or `"Fleet"`). */
export function unitTypeName(unitType: UnitType): 'Army' | 'Fleet' {
  return unitType === 'A' ? 'Army' : 'Fleet';
}
