import type { TurnHistoryEntry, TurnRecord } from '../types/diplomacy';
import { apiJson } from './client';

function passcodeHeaders(
  passcode: string | null,
): Record<string, string> | undefined {
  return passcode ? { 'X-Passcode': passcode } : undefined;
}

export function fetchTurnHistory(
  gameId: string,
  passcode: string | null,
): Promise<TurnHistoryEntry[]> {
  return apiJson<TurnHistoryEntry[]>('/history', {
    query: { game_id: gameId },
    headers: passcodeHeaders(passcode),
    auth: 'headers',
  });
}

export function fetchTurnRecord(
  gameId: string,
  index: number,
  passcode: string | null,
): Promise<TurnRecord> {
  return apiJson<TurnRecord>(`/history/${index}`, {
    query: { game_id: gameId },
    headers: passcodeHeaders(passcode),
    auth: 'headers',
  });
}
