import type React from 'react';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/supabase';
import {
  type AuthUser,
  type GameState,
  POWER_METADATA,
  type Power,
  type Unit,
  type UnitType,
} from '../../types/diplomacy';
import type { ConfirmOptions } from '../ConfirmModal';

const API_BASE = '/api';

export interface UseAdminActionsArgs {
  isOpen: boolean;
  gameId: string;
  gameState: GameState;
  user: AuthUser | null;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  onStateUpdated: (newState: GameState) => void;
  onToast: (msg: string) => void;
}

/**
 * The creator console's state and API calls: the turn, relocation, spawn and ownership forms,
 * the status and error banners, and one handler per admin endpoint. Each handler posts with the
 * caller's headers, hands the server's new state to `onStateUpdated`, and then toasts.
 */
export function useAdminActions({
  isOpen,
  gameId,
  gameState,
  user,
  confirm,
  onStateUpdated,
  onToast,
}: UseAdminActionsArgs) {
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [canRollback, setCanRollback] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Time & Turn Form State
  const [selectedSeason, setSelectedSeason] = useState<string>(
    gameState.season,
  );
  const [selectedYear, setSelectedYear] = useState<number>(gameState.year);
  const [selectedPhase, setSelectedPhase] = useState<string>(gameState.phase);

  // Unit Relocation ("Move Anywhere") Form State
  const [moveUnitId, setMoveUnitId] = useState<string>('');
  const [moveTargetProvince, setMoveTargetProvince] = useState<string>('BUR');
  const [moveTargetCoast, setMoveTargetCoast] = useState<string>('');

  // Spawn Unit Form State
  const [spawnPower, setSpawnPower] = useState<Power>('FRANCE');
  const [spawnUnitType, setSpawnUnitType] = useState<UnitType>('A');
  const [spawnProvince, setSpawnProvince] = useState<string>('PAR');
  const [spawnCoast, setSpawnCoast] = useState<string>('');

  // Destroy Unit State Filter
  const [destroyFilterPower, setDestroyFilterPower] = useState<string>('ALL');

  // Territory / Ownership Form State
  const [territoryProvince, setTerritoryProvince] = useState<string>('BEL');
  const [territoryOwner, setTerritoryOwner] = useState<string>('NEUTRAL');

  const getHeaders = async () => {
    const authHeaders = await getAuthHeaders();
    return {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(user?.id ? { 'X-User-Id': user.id } : {}),
      ...(user?.email ? { 'X-User-Email': user.email } : {}),
    };
  };

  const fetchAdminStatus = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/admin/status?game_id=${encodeURIComponent(gameId)}`,
        { headers: await getHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        setHistoryCount(data.history_count);
        setCanRollback(data.can_rollback);
      }
    } catch (e) {
      console.error('Failed to fetch admin status:', e);
    }
  };

  // Reset the turn form only when the console opens or the game reaches another turn.
  // Every order anyone sends also updates gameState, and resetting on those would
  // undo what the admin is typing and clear the error from their last action.
  // (The list below also holds `fetchAdminStatus`, which is a new function on every render, so
  // in practice this runs after every render while the console is open.)
  useEffect(() => {
    if (isOpen) {
      fetchAdminStatus();
      setSelectedSeason(gameState.season);
      setSelectedYear(gameState.year);
      setSelectedPhase(gameState.phase);
      setActionError(null);
    }
  }, [
    isOpen,
    gameState.phase,
    gameState.year,
    gameState.season,
    fetchAdminStatus,
  ]);

  // Keep the relocation choice on a unit that still exists.
  useEffect(() => {
    if (!isOpen) return;
    if (!gameState.units.some((u) => u.id === moveUnitId)) {
      setMoveUnitId(gameState.units[0]?.id ?? '');
    }
  }, [isOpen, gameState.units, moveUnitId]);

  const handleRollback = async (event: React.MouseEvent) => {
    if (!canRollback) return;
    const ok = await confirm(
      {
        title: 'Roll back to the previous turn?',
        message:
          'The game returns to the previous turn state. Any moves or changes in the current turn will be reverted.',
        confirmLabel: 'Roll back',
      },
      event,
    );
    if (!ok) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/rollback?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({ user_id: user?.id, email: user?.email }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Rollback failed.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(`Turn rolled back to ${st.season} ${st.year} ${st.phase}!`);
      fetchAdminStatus();
    } catch (e: any) {
      setActionError(e.message || 'Network error executing rollback.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetTurn = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/set-turn?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            season: selectedSeason,
            year: selectedYear,
            phase: selectedPhase,
            user_id: user?.id,
            email: user?.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to adjust turn clock.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(`Clock adjusted to ${st.season} ${st.year} (${st.phase} Phase).`);
    } catch (e: any) {
      setActionError(e.message || 'Network error setting turn.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnfinalizeAll = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/unfinalize-all?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({ user_id: user?.id, email: user?.email }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to unfinalize powers.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast('All Great Power orders unlocked for editing!');
    } catch (e: any) {
      setActionError(e.message || 'Network error unlocking powers.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveUnit = async () => {
    if (!moveUnitId) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/unit/move?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            unit_id: moveUnitId,
            new_province: moveTargetProvince,
            new_coast: moveTargetCoast || null,
            user_id: user?.id,
            email: user?.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to move unit.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(`Relocated unit ${moveUnitId} to ${moveTargetProvince}!`);
    } catch (e: any) {
      setActionError(e.message || 'Network error moving unit.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpawnUnit = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/unit/spawn?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            power: spawnPower,
            unit_type: spawnUnitType,
            province: spawnProvince,
            coast: spawnCoast || null,
            user_id: user?.id,
            email: user?.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to spawn unit.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(
        `Spawned ${POWER_METADATA[spawnPower].shortName} ${spawnUnitType === 'A' ? 'Army' : 'Fleet'} in ${spawnProvince}!`,
      );
    } catch (e: any) {
      setActionError(e.message || 'Network error spawning unit.');
    } finally {
      setLoading(false);
    }
  };

  const handleDestroyUnit = async (unit: Unit, event: React.MouseEvent) => {
    const ok = await confirm(
      {
        title: 'Destroy this unit?',
        message: `${POWER_METADATA[unit.power].shortName} ${
          unit.unit_type === 'A' ? 'Army' : 'Fleet'
        } in ${unit.province} will be removed from the board.`,
        confirmLabel: 'Destroy',
      },
      event,
    );
    if (!ok) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/unit/destroy?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            unit_id: unit.id,
            user_id: user?.id,
            email: user?.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to destroy unit.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(`Destroyed unit in ${unit.province}.`);
    } catch (e: any) {
      setActionError(e.message || 'Network error destroying unit.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetOwnership = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const pwr =
        territoryOwner === 'NEUTRAL' ? null : (territoryOwner as Power);
      const res = await fetch(
        `${API_BASE}/admin/ownership?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            province: territoryProvince,
            power: pwr,
            user_id: user?.id,
            email: user?.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to set ownership.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(
        `Assigned ${territoryProvince} to ${
          pwr ? POWER_METADATA[pwr].shortName : 'Neutral'
        }!`,
      );
    } catch (e: any) {
      setActionError(e.message || 'Network error updating ownership.');
    } finally {
      setLoading(false);
    }
  };

  return {
    historyCount,
    canRollback,
    loading,
    actionError,
    selectedSeason,
    setSelectedSeason,
    selectedYear,
    setSelectedYear,
    selectedPhase,
    setSelectedPhase,
    moveUnitId,
    setMoveUnitId,
    moveTargetProvince,
    setMoveTargetProvince,
    moveTargetCoast,
    setMoveTargetCoast,
    spawnPower,
    setSpawnPower,
    spawnUnitType,
    setSpawnUnitType,
    spawnProvince,
    setSpawnProvince,
    spawnCoast,
    setSpawnCoast,
    destroyFilterPower,
    setDestroyFilterPower,
    territoryProvince,
    setTerritoryProvince,
    territoryOwner,
    setTerritoryOwner,
    handleRollback,
    handleSetTurn,
    handleUnfinalizeAll,
    handleMoveUnit,
    handleSpawnUnit,
    handleDestroyUnit,
    handleSetOwnership,
  };
}
