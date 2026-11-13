import type { Power } from '../types/diplomacy';
import { apiFetch } from './client';

export function enterSandbox(gameId: string, power: Power): Promise<Response> {
  return apiFetch('/sandbox/enter', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}

export function exitSandbox(gameId: string, power: Power): Promise<Response> {
  return apiFetch('/sandbox/exit', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}

export function clearForeignPreMoves(
  gameId: string,
  power: Power,
): Promise<Response> {
  return apiFetch('/sandbox/clear-foreign', {
    method: 'POST',
    query: { game_id: gameId },
    body: { power },
  });
}

export function generateAiOrders(
  gameId: string,
  body: { powers: Power[] | null; include_active: boolean },
): Promise<Response> {
  return apiFetch('/sandbox/ai-orders', {
    method: 'POST',
    query: { game_id: gameId },
    body,
  });
}

export function stepTurnWithAi(gameId: string): Promise<Response> {
  return apiFetch('/sandbox/ai-step', {
    method: 'POST',
    query: { game_id: gameId },
  });
}

export function loadScenario(
  gameId: string,
  body: { scenario_id: string; active_power: Power },
): Promise<Response> {
  return apiFetch('/scenario', {
    method: 'POST',
    query: { game_id: gameId },
    body,
  });
}
