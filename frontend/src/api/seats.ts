import type { JoinGameRequest, Power } from '../types/diplomacy';
import { apiFetch } from './client';

export function joinGame(
  gameId: string,
  req: JoinGameRequest,
): Promise<Response> {
  return apiFetch(`/games/${encodeURIComponent(gameId)}/join`, {
    method: 'POST',
    body: req,
  });
}

export function surrenderPower(
  gameId: string,
  body: { power: Power; user_id: string; email: string; leave: boolean },
): Promise<Response> {
  return apiFetch(`/games/${encodeURIComponent(gameId)}/surrender`, {
    method: 'POST',
    body,
  });
}

export function leaveGame(
  gameId: string,
  body: { power: Power; user_id: string; email: string },
): Promise<Response> {
  return apiFetch(`/games/${encodeURIComponent(gameId)}/leave`, {
    method: 'POST',
    body,
  });
}

export function setActivePower(
  gameId: string,
  power: Power,
): Promise<Response> {
  return apiFetch('/power', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}
