import { getAuthHeaders } from '../lib/supabase';
import type {
  CreateGameRequest,
  GameState,
  MultiplayerGameSummary,
  Power,
  ProvinceInfo,
} from '../types/diplomacy';
import { apiFetch, apiJson } from './client';

export interface GameBootstrapResponse {
  state: GameState;
  provinces: Record<string, ProvinceInfo>;
  summary?: MultiplayerGameSummary | null;
}

export function fetchPublicGames(): Promise<Response> {
  return apiFetch('/games', { auth: false });
}

export function fetchMyGames(): Promise<Response> {
  return apiFetch('/games/mine', { auth: 'headers' });
}

export function fetchGameState(
  gameId: string,
  power?: Power | null,
): Promise<Response> {
  return apiFetch('/game', {
    query: {
      game_id: gameId,
      power: power || undefined,
    },
    auth: 'headers',
  });
}

export function createSoloSandbox(
  resumeGameId?: string | null,
): Promise<Response> {
  return apiFetch('/games/solo-sandbox', {
    method: 'POST',
    query: resumeGameId ? { resume_game_id: resumeGameId } : undefined,
  });
}

export async function createMultiplayerGame(
  req: CreateGameRequest,
): Promise<Response> {
  return apiFetch('/games', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: req,
    auth: false,
  });
}

export function saveSandboxToAccount(
  gameId: string,
  body: {
    name: string;
    user_id?: string;
    email?: string;
    display_name?: string;
  },
): Promise<Response> {
  return apiFetch('/games/save-sandbox', {
    method: 'POST',
    query: { game_id: gameId },
    body,
  });
}

export function acknowledgeGameOver(
  gameId: string,
): Promise<{ summary?: MultiplayerGameSummary }> {
  return apiJson<{ summary?: MultiplayerGameSummary }>(
    `/games/${encodeURIComponent(gameId)}/acknowledge-game-over`,
    { method: 'POST', auth: 'headers' },
  );
}
