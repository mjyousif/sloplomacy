import type { Order, Power } from '../types/diplomacy';
import { apiFetch } from './client';

export function updateSingleOrder(
  gameId: string,
  order: Order,
  turn?: string,
): Promise<Response> {
  return apiFetch('/order', {
    method: 'POST',
    query: { game_id: gameId },
    body: { order, turn },
  });
}

export function confirmAllOrders(
  gameId: string,
  power: Power,
): Promise<Response> {
  return apiFetch('/orders/confirm-all', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}

export function finalizeOrders(
  gameId: string,
  body: { power: Power; force: boolean; turn: string },
): Promise<Response> {
  return apiFetch('/finalize', {
    method: 'POST',
    query: { game_id: gameId },
    body,
  });
}

export function unfinalizeOrders(
  gameId: string,
  power: Power,
): Promise<Response> {
  return apiFetch('/unfinalize', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}

export function sendTimerAction(
  gameId: string,
  action: 'start' | 'vote' | 'extend' | 'ready',
  body: Record<string, unknown> = {},
): Promise<Response> {
  return apiFetch(`/games/${encodeURIComponent(gameId)}/timer/${action}`, {
    method: 'POST',
    body,
  });
}

export function adjudicateTurn(
  gameId: string,
  turn: string,
): Promise<Response> {
  return apiFetch('/adjudicate', {
    method: 'POST',
    query: { game_id: gameId, turn },
  });
}
