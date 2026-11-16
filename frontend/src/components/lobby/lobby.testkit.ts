import { vi } from 'vitest';
import type {
  AuthUser,
  LobbyBrowsePage,
  LobbyGameRow,
  MultiplayerGameSummary,
  Power,
} from '../../types/diplomacy';

export const ME = {
  id: 'me',
  email: 'me@x',
  displayName: 'Ada',
} as AuthUser;

/** A participant record for a seat. */
export const seat = (
  power: Power,
  userId: string,
  name = `Player ${userId}`,
) => ({
  user_id: userId,
  email: `${userId}@x`,
  display_name: name,
  power,
  joined_at: '2026-01-01',
});

export function game(
  over: Partial<MultiplayerGameSummary> = {},
): MultiplayerGameSummary {
  return {
    game_id: 'mp_1',
    name: 'Congress of Vienna',
    status: 'waiting',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    created_by: 'Host',
    created_at: '2026-01-01T00:00:00Z',
    participants: {},
    finalized_powers: [],
    is_sandbox: false,
    ...over,
  };
}

/** A public game as `GET /api/games/browse` lists it: France and Russia taken. */
export function browseRow(over: Partial<LobbyGameRow> = {}): LobbyGameRow {
  return {
    game_id: 'mp_open',
    name: 'Friday Night',
    status: 'active',
    season: 'Fall',
    year: 1903,
    phase: 'Movement',
    host_name: 'Gage',
    created_at: '2026-11-03T12:00:00Z',
    last_moved_at: '2026-11-11T10:00:00Z',
    claimed_powers: ['FRANCE', 'RUSSIA'],
    open_powers: ['AUSTRIA', 'ENGLAND', 'GERMANY', 'ITALY', 'TURKEY'],
    ...over,
  };
}

export const FULL_ROW = browseRow({
  game_id: 'mp_full',
  name: 'Packed House',
  claimed_powers: [
    'AUSTRIA',
    'ENGLAND',
    'FRANCE',
    'GERMANY',
    'ITALY',
    'RUSSIA',
    'TURKEY',
  ],
  open_powers: [],
});

export const browsePage = (
  games: LobbyGameRow[],
  total = games.length,
  page = 1,
): LobbyBrowsePage => ({ games, total, page, page_size: 10 });

/** A `fetch` stub that answers every browse request with `reply`. */
export const browseFetch = (reply: () => LobbyBrowsePage) =>
  vi.fn(async () => ({ ok: true, json: async () => reply() }));

/** The query of the last browse request a fetch stub saw. */
export const lastBrowseQuery = (fetchMock: ReturnType<typeof vi.fn>) =>
  new URLSearchParams(
    String(fetchMock.mock.calls.at(-1)?.[0] ?? '').split('?')[1],
  );
