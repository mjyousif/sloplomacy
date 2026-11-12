import type {
  AuthUser,
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
