import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmOptions } from '../components/ConfirmModal';
import type {
  AuthUser,
  GameState,
  Order,
  Power,
  ProvinceInfo,
  Unit,
  UnitType,
} from '../types/diplomacy';
import {
  acknowledgeAdminEntriesRequest,
  getUnacknowledgedAdminEntries,
  postAdminBoardEditRequest,
} from '../utils/adminHelpers';
import {
  applyStageRelocate,
  applyStageSpawnOrUpdate,
  applyUndoStagedChange,
  computeStagedChanges,
  computeStagedDiffLines,
  type StagedChangeEntry,
} from '../utils/adminStagedChanges';

export { computeStagedChanges, computeStagedDiffLines, type StagedChangeEntry };

export interface UseAdminDirectEditParams {
  activeGameId: string;
  viewMode?: 'lobby' | 'sandbox' | 'multiplayer';
  lockedPower?: Power | null;
  gameState: GameState | null;
  provinces: Record<string, ProvinceInfo>;
  directEditActive: boolean;
  setDirectEditActive: React.Dispatch<React.SetStateAction<boolean>>;
  authUser: AuthUser | null;
  onUpdateGameState: (newState: GameState) => void;
  showToast: (msg: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

export function useAdminDirectEdit({
  activeGameId,
  viewMode = 'sandbox',
  lockedPower = null,
  gameState,
  provinces,
  directEditActive,
  setDirectEditActive,
  authUser,
  onUpdateGameState,
  showToast,
  confirm,
}: UseAdminDirectEditParams) {
  const [stagedUnits, setStagedUnits] = useState<Unit[]>([]);
  const [stagedOwnership, setStagedOwnership] = useState<Record<string, Power>>(
    {},
  );
  const [stagedOrders, setStagedOrders] = useState<Record<string, Order>>({});
  const [baseRevision, setBaseRevision] = useState<number>(1);
  const [baseTurn, setBaseTurn] = useState<{
    season: string;
    year: number;
    phase: string;
  }>({
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
  });
  const [inspectedProvince, setInspectedProvince] = useState<string | null>(
    null,
  );
  const [relocatingUnitId, setRelocatingUnitId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [acknowledgingAdminEntries, setAcknowledgingAdminEntries] =
    useState(false);

  const syncFromState = useCallback((state: GameState) => {
    setStagedUnits(state.units.map((u) => ({ ...u })));
    setStagedOwnership({ ...state.ownership });
    setStagedOrders(
      Object.fromEntries(
        Object.entries(state.orders).map(([k, v]) => [k, { ...v }]),
      ),
    );
    setBaseRevision(state.state_revision ?? 1);
    setBaseTurn({
      season: state.season,
      year: state.year,
      phase: state.phase,
    });
  }, []);

  const stagedChanges = useMemo(
    () =>
      directEditActive
        ? computeStagedChanges(
            gameState,
            stagedUnits,
            stagedOwnership,
            stagedOrders,
            provinces,
          )
        : [],
    [
      directEditActive,
      gameState,
      provinces,
      stagedUnits,
      stagedOwnership,
      stagedOrders,
    ],
  );

  const diffLines = useMemo(
    () => stagedChanges.map((entry) => entry.label),
    [stagedChanges],
  );

  const isDirty = directEditActive && diffLines.length > 0;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const prevDirectEditRef = useRef(false);
  const prevGameIdRef = useRef(activeGameId);

  useEffect(() => {
    if (!directEditActive) {
      prevDirectEditRef.current = false;
      setInspectedProvince(null);
      setRelocatingUnitId(null);
      return;
    }
    const justEntered = !prevDirectEditRef.current;
    const gameChanged = prevGameIdRef.current !== activeGameId;
    prevDirectEditRef.current = true;
    prevGameIdRef.current = activeGameId;

    if (gameState && (justEntered || gameChanged || !isDirtyRef.current)) {
      syncFromState(gameState);
    }
  }, [directEditActive, activeGameId, gameState, syncFromState]);

  useEffect(() => {
    if (!directEditActive || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [directEditActive, isDirty]);

  const discardChanges = useCallback(() => {
    if (gameState) {
      syncFromState(gameState);
    }
    setInspectedProvince(null);
    setRelocatingUnitId(null);
  }, [gameState, syncFromState]);

  const stageRelocateUnit = useCallback(
    (
      unitId: string,
      targetProvId: string,
      targetCoast?: string | null,
    ): boolean => {
      const next = applyStageRelocate(
        stagedUnits,
        stagedOrders,
        provinces,
        unitId,
        targetProvId,
        targetCoast,
        showToast,
      );
      if (!next.ok) return false;
      setStagedUnits(next.units);
      setStagedOrders(next.orders);
      setRelocatingUnitId(null);
      setInspectedProvince(next.provId);
      return true;
    },
    [provinces, stagedOrders, stagedUnits, showToast],
  );

  const stageSpawnOrUpdateUnit = useCallback(
    (
      province: string,
      power: Power,
      unitType: UnitType,
      coast?: string | null,
    ): boolean => {
      const next = applyStageSpawnOrUpdate(
        stagedUnits,
        stagedOrders,
        provinces,
        province,
        power,
        unitType,
        coast,
        showToast,
      );
      if (!next.ok) return false;
      setStagedUnits(next.units);
      setStagedOrders(next.orders);
      return true;
    },
    [provinces, stagedOrders, stagedUnits, showToast],
  );

  const stageDestroyUnit = useCallback((unitId: string) => {
    setStagedUnits((prev) => prev.filter((u) => u.id !== unitId));
    setStagedOrders((prev) => {
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
    setRelocatingUnitId((prev) => (prev === unitId ? null : prev));
  }, []);

  const stageProvinceOwnership = useCallback(
    (province: string, power: Power | null) => {
      const provId = province.toUpperCase();
      setStagedOwnership((prev) => {
        const next = { ...prev };
        if (power === null) {
          delete next[provId];
        } else {
          next[provId] = power;
        }
        return next;
      });
    },
    [],
  );

  const stageUnitOrder = useCallback((order: Order) => {
    setStagedOrders((prev) => ({
      ...prev,
      [order.unit_id]: { ...order, is_explicit: true },
    }));
  }, []);

  const applyChanges = useCallback(async (): Promise<boolean> => {
    if (!gameState || !isDirty) return true;
    setCommitting(true);
    try {
      const res = await postAdminBoardEditRequest(activeGameId, {
        expected_revision: baseRevision,
        expected_season: baseTurn.season,
        expected_year: baseTurn.year,
        expected_phase: baseTurn.phase,
        units: stagedUnits,
        ownership: stagedOwnership,
        orders: stagedOrders,
        summary_lines: diffLines.map((line) => `[ADMIN OVERRIDE] ${line}.`),
        user_id: authUser?.id || 'guest',
        email: authUser?.email || 'commander@diplomacy.local',
      });

      if (res.status === 409) {
        const errData = await res.json().catch(() => ({}));
        const shouldReload = await confirm({
          title: 'Board State Changed (409 Conflict)',
          message:
            errData.detail ||
            'The underlying match state changed while you were editing. Discard your draft changes and reload the latest board state?',
          confirmLabel: 'Discard Draft & Reload',
        });
        if (shouldReload && gameState) {
          syncFromState(gameState);
          setInspectedProvince(null);
          setRelocatingUnitId(null);
        }
        return false;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to apply admin board edits.');
        return false;
      }

      const updated: GameState = await res.json();
      onUpdateGameState(updated);
      syncFromState(updated);
      setRelocatingUnitId(null);
      showToast(
        `Applied ${diffLines.length} admin board edit${diffLines.length === 1 ? '' : 's'}.`,
      );
      return true;
    } catch {
      showToast('Network error applying admin board edits.');
      return false;
    } finally {
      setCommitting(false);
    }
  }, [
    activeGameId,
    authUser,
    baseRevision,
    baseTurn,
    confirm,
    diffLines,
    gameState,
    isDirty,
    onUpdateGameState,
    showToast,
    stagedOrders,
    stagedOwnership,
    stagedUnits,
    syncFromState,
  ]);

  const confirmIfDirty = useCallback(
    async (actionDescription = 'leave'): Promise<boolean> => {
      if (!directEditActive || !isDirty) return true;
      const ok = await confirm({
        title: 'Unapplied Edit Board Changes',
        message: `You have ${diffLines.length} unapplied board edit${diffLines.length === 1 ? '' : 's'}. Discard your uncommitted changes and ${actionDescription}?`,
        confirmLabel: 'Discard Changes',
      });
      if (ok) {
        discardChanges();
      }
      return ok;
    },
    [confirm, diffLines.length, directEditActive, discardChanges, isDirty],
  );

  const handleToggleDirectEdit = useCallback(async () => {
    if (directEditActive) {
      const ok = await confirmIfDirty('exit Edit Board mode');
      if (!ok) return;
      setDirectEditActive(false);
    } else {
      setDirectEditActive(true);
    }
  }, [confirmIfDirty, directEditActive, setDirectEditActive]);

  const effectiveGameState = useMemo(() => {
    if (!gameState || !directEditActive) return gameState;
    return {
      ...gameState,
      units: stagedUnits,
      ownership: stagedOwnership,
      orders: stagedOrders,
    };
  }, [directEditActive, gameState, stagedOrders, stagedOwnership, stagedUnits]);

  const unacknowledgedAdminEntries = useMemo(
    () =>
      getUnacknowledgedAdminEntries(
        gameState?.admin_log,
        authUser,
        lockedPower,
        viewMode,
      ),
    [authUser, gameState?.admin_log, lockedPower, viewMode],
  );

  const handleAcknowledgeAdminEntries = useCallback(async () => {
    if (!gameState || unacknowledgedAdminEntries.length === 0) return;
    setAcknowledgingAdminEntries(true);
    try {
      const result = await acknowledgeAdminEntriesRequest(
        activeGameId,
        unacknowledgedAdminEntries.map((e) => e.id),
        authUser,
        lockedPower,
      );
      if (result?.ok) {
        const ackedIds = new Set(unacknowledgedAdminEntries.map((e) => e.id));
        const viewerTokens = [
          result.acknowledged_by,
          authUser?.id,
          authUser?.email,
          lockedPower,
          !authUser && !lockedPower ? 'guest' : null,
        ].filter((t): t is string => Boolean(t));
        onUpdateGameState({
          ...gameState,
          admin_log: (gameState.admin_log ?? []).map((entry) =>
            ackedIds.has(entry.id)
              ? {
                  ...entry,
                  acknowledged_by: Array.from(
                    new Set([
                      ...(entry.acknowledged_by ?? []),
                      ...viewerTokens,
                    ]),
                  ),
                }
              : entry,
          ),
        });
      }
    } finally {
      setAcknowledgingAdminEntries(false);
    }
  }, [
    activeGameId,
    authUser,
    gameState,
    lockedPower,
    onUpdateGameState,
    unacknowledgedAdminEntries,
  ]);

  const clearStagedChanges = useCallback(async () => {
    if (!isDirty) return;
    const n = diffLines.length;
    const ok = await confirm({
      title: 'Clear Staged Board Edits?',
      message: `This discards all ${n} unapplied board edit${n === 1 ? '' : 's'} and restores the live board. This cannot be undone.`,
      confirmLabel: 'Clear Changes',
    });
    if (ok) discardChanges();
  }, [confirm, diffLines.length, discardChanges, isDirty]);

  const undoStagedChange = useCallback(
    (changeId: string) => {
      const reverted = applyUndoStagedChange(
        gameState,
        stagedUnits,
        stagedOwnership,
        stagedOrders,
        changeId,
      );
      setStagedUnits(reverted.units);
      setStagedOwnership(reverted.ownership);
      setStagedOrders(reverted.orders);
      if (
        relocatingUnitId &&
        !reverted.units.some((u) => u.id === relocatingUnitId)
      ) {
        setRelocatingUnitId(null);
      }
    },
    [gameState, relocatingUnitId, stagedOrders, stagedOwnership, stagedUnits],
  );

  return {
    effectiveGameState,
    inspectedProvince,
    setInspectedProvince,
    relocatingUnitId,
    setRelocatingUnitId,
    stagedChanges,
    diffLines,
    isDirty,
    committing,
    discardChanges,
    clearStagedChanges,
    applyChanges,
    stageUnitOrder,
    onUndoStagedChange: undoStagedChange,
    onStageRelocateUnit: stageRelocateUnit,
    onStageSpawnOrUpdateUnit: stageSpawnOrUpdateUnit,
    onStageDestroyUnit: stageDestroyUnit,
    onStageOwnership: stageProvinceOwnership,
    onStageUnitOrder: stageUnitOrder,
    confirmIfDirty,
    handleToggleDirectEdit,
    unacknowledgedAdminEntries,
    acknowledgingAdminEntries,
    handleAcknowledgeAdminEntries,
  };
}
