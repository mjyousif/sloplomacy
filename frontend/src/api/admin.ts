import type { AdminStatusResponse, Power } from '../types/diplomacy';
import { apiFetch, apiJson } from './client';

export interface AdminAcknowledgeBody {
  entry_ids: string[];
  user_id?: string;
  email?: string;
  power: Power | null;
}

export function fetchAdminStatus(
  gameId: string,
  headers: Record<string, string>,
): Promise<AdminStatusResponse> {
  return apiJson<AdminStatusResponse>('/admin/status', {
    query: { game_id: gameId },
    headers,
    auth: false,
  });
}

export function rollbackAdminTurn(
  gameId: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  return apiFetch('/admin/rollback', {
    method: 'POST',
    query: { game_id: gameId },
    headers,
    body,
    auth: false,
  });
}

export function setAdminTurn(
  gameId: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  return apiFetch('/admin/set-turn', {
    method: 'POST',
    query: { game_id: gameId },
    headers,
    body,
    auth: false,
  });
}

export function unfinalizeAllAdmin(
  gameId: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  return apiFetch('/admin/unfinalize-all', {
    method: 'POST',
    query: { game_id: gameId },
    headers,
    body,
    auth: false,
  });
}

export function acknowledgeAdminEntries(
  gameId: string,
  body: AdminAcknowledgeBody,
): Promise<Response> {
  return apiFetch('/admin/acknowledge', {
    method: 'POST',
    query: { game_id: gameId },
    body,
  });
}

export function postAdminBoardEdit(
  gameId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return apiFetch('/admin/board-edit', {
    method: 'POST',
    query: { game_id: gameId },
    body: payload,
  });
}
