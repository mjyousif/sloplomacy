import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GameState,
  Order,
  Power,
  Unit,
  UnitType,
} from '../types/diplomacy';
import {
  type AdminBoardSnapshot,
  applyOwnershipChange,
  applyStageDestroy,
  buildAdminBoardEditPayload,
  buildClearEditsConfirmOptions,
  buildDiscardEditsConfirmOptions,
  commitAdminBoardEdit,
  findDisplacedAndRelocatedIds,
  getRevertedOrderUnitId,
  hasLiveBoardDiverged,
  mergeBaseSnapshotOrders,
  resolveAdminOrderStage,
  snapshotAdminBoardState,
  type UseAdminDirectEditParams,
} from '../utils/adminHelpers';
import {
  applyStageRelocate,
  applyStageSpawnOrUpdate,
  applyUndoStagedChange,
  computeStagedChanges,
  mergeLiveUnitOrders,
} from '../utils/adminStagedChanges';
import { sameTurn, type TurnLike } from '../utils/turnFormat';
import { useAdminAcknowledgement } from './useAdminAcknowledgement';
import { useBeforeUnload } from './useBeforeUnload';
import { useBoardConflictPrompt } from './useBoardConflictPrompt';

export {
  computeStagedChanges,
  computeStagedDiffLines,
  type StagedChangeEntry,
} from '../utils/adminStagedChanges';
export type { UseAdminDirectEditParams };

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
  const [baseState, setBaseState] = useState<AdminBoardSnapshot | null>(null);
  const [stagedOrderIds, setStagedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [baseRevision, setBaseRevision] = useState<number>(1);
  const [baseTurn, setBaseTurn] = useState<TurnLike>({
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
  });
  const [inspectedProvince, setInspectedProvince] = useState<string | null>(
    null,
  );
  const [relocatingUnitId, setRelocatingUnitId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const lastSyncedGameStateRef = useRef<GameState | null>(null);

  const syncFromState = useCallback((state: GameState) => {
    const snapshot = snapshotAdminBoardState(state);
    lastSyncedGameStateRef.current = state;
    setBaseState(snapshot);
    setStagedUnits(snapshot.units);
    setStagedOwnership(snapshot.ownership);
    setStagedOrders(snapshot.orders);
    setStagedOrderIds(new Set());
    setBaseRevision(state.board_revision ?? state.state_revision ?? 1);
    setBaseTurn((prev) =>
      sameTurn(prev, state)
        ? prev
        : { season: state.season, year: state.year, phase: state.phase },
    );
  }, []);

  const stagedChanges = useMemo(
    () =>
      directEditActive && baseState
        ? computeStagedChanges(
            baseState,
            stagedUnits,
            stagedOwnership,
            stagedOrders,
            provinces,
          )
        : [],
    [
      baseState,
      directEditActive,
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
  const stagedUnitsRef = useRef(stagedUnits);
  stagedUnitsRef.current = stagedUnits;
  const stagedOrderIdsRef = useRef(stagedOrderIds);
  stagedOrderIdsRef.current = stagedOrderIds;

  const prevDirectEditRef = useRef(false);
  const prevGameIdRef = useRef(activeGameId);

  const clearSelection = useCallback(() => {
    setInspectedProvince(null);
    setRelocatingUnitId(null);
  }, []);

  const handleReloadLatest = useCallback(
    (latest: GameState) => {
      syncFromState(latest);
      clearSelection();
    },
    [clearSelection, syncFromState],
  );

  const { promptBoardConflictReload, resetPromptedConflict } =
    useBoardConflictPrompt({
      directEditActive,
      isDirtyRef,
      committingRef,
      baseRevision,
      baseTurn,
      gameState,
      confirm,
      onReloadLatest: handleReloadLatest,
    });

  useEffect(() => {
    if (!directEditActive) {
      prevDirectEditRef.current = false;
      lastSyncedGameStateRef.current = null;
      setBaseState(null);
      clearSelection();
      return;
    }
    const justEntered = !prevDirectEditRef.current;
    const gameChanged = prevGameIdRef.current !== activeGameId;
    prevDirectEditRef.current = true;
    prevGameIdRef.current = activeGameId;

    if (
      gameState &&
      (justEntered ||
        gameChanged ||
        (!isDirtyRef.current && lastSyncedGameStateRef.current !== gameState))
    ) {
      syncFromState(gameState);
      resetPromptedConflict();
    } else if (
      gameState &&
      lastSyncedGameStateRef.current !== gameState &&
      !hasLiveBoardDiverged(gameState, baseRevision, baseTurn)
    ) {
      lastSyncedGameStateRef.current = gameState;
      setBaseState((prev) =>
        mergeBaseSnapshotOrders(prev, gameState, stagedOrderIdsRef.current),
      );
      setStagedOrders((prev) =>
        mergeLiveUnitOrders(
          gameState,
          stagedUnitsRef.current,
          prev,
          stagedOrderIdsRef.current,
        ),
      );
    }
  }, [
    activeGameId,
    baseRevision,
    baseTurn,
    clearSelection,
    directEditActive,
    gameState,
    resetPromptedConflict,
    syncFromState,
  ]);

  const dropStagedOrderIds = useCallback((...ids: string[]) => {
    setStagedOrderIds((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const nextSet = new Set(prev);
      for (const id of ids) nextSet.delete(id);
      return nextSet;
    });
  }, []);

  useBeforeUnload(directEditActive && isDirty);

  const discardChanges = useCallback(() => {
    if (gameState) {
      syncFromState(gameState);
    }
    clearSelection();
  }, [clearSelection, gameState, syncFromState]);

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
      dropStagedOrderIds(
        ...findDisplacedAndRelocatedIds(stagedUnits, next.units, unitId),
      );
      setRelocatingUnitId(null);
      setInspectedProvince(next.provId);
      return true;
    },
    [dropStagedOrderIds, provinces, stagedOrders, stagedUnits, showToast],
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
      const provId = province.toUpperCase();
      const existing = stagedUnits.find(
        (u) => !u.is_dislodged && u.province === provId,
      );
      setStagedUnits(next.units);
      setStagedOrders(next.orders);
      if (existing) dropStagedOrderIds(existing.id);
      return true;
    },
    [dropStagedOrderIds, provinces, stagedOrders, stagedUnits, showToast],
  );

  const stageDestroyUnit = useCallback(
    (unitId: string) => {
      const next = applyStageDestroy(stagedUnits, stagedOrders, unitId);
      setStagedUnits(next.units);
      setStagedOrders(next.orders);
      dropStagedOrderIds(unitId);
      setRelocatingUnitId((prev) => (prev === unitId ? null : prev));
    },
    [dropStagedOrderIds, stagedOrders, stagedUnits],
  );

  const stageProvinceOwnership = useCallback(
    (province: string, power: Power | null) => {
      setStagedOwnership((prev) => applyOwnershipChange(prev, province, power));
    },
    [],
  );

  const stageUnitOrder = useCallback(
    (order: Order) => {
      const { nextOrder, isExplicitOverride } = resolveAdminOrderStage(
        baseState ?? gameState,
        stagedUnits,
        order,
      );
      setStagedOrders((prev) => ({ ...prev, [order.unit_id]: nextOrder }));
      if (!isExplicitOverride) {
        dropStagedOrderIds(order.unit_id);
        return;
      }
      setStagedOrderIds((prev) => {
        if (prev.has(order.unit_id)) return prev;
        const nextSet = new Set(prev);
        nextSet.add(order.unit_id);
        return nextSet;
      });
    },
    [baseState, dropStagedOrderIds, gameState, stagedUnits],
  );

  const applyChanges = useCallback(async (): Promise<boolean> => {
    if (!gameState || !isDirty) return true;
    committingRef.current = true;
    setCommitting(true);
    try {
      const payload = buildAdminBoardEditPayload(
        baseRevision,
        baseTurn,
        stagedUnits,
        stagedOwnership,
        stagedOrders,
        stagedOrderIds,
        diffLines,
      );
      const outcome = await commitAdminBoardEdit(activeGameId, payload);
      committingRef.current = false;
      setCommitting(false);

      if (outcome.kind === 'conflict') {
        await promptBoardConflictReload(outcome.detail);
        return false;
      }
      if (outcome.kind === 'error') {
        showToast(outcome.message);
        return false;
      }

      onUpdateGameState(outcome.state);
      syncFromState(outcome.state);
      resetPromptedConflict();
      setRelocatingUnitId(null);
      showToast(
        `Applied ${diffLines.length} admin board edit${diffLines.length === 1 ? '' : 's'}.`,
      );
      return true;
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  }, [
    activeGameId,
    baseRevision,
    baseTurn,
    diffLines,
    gameState,
    isDirty,
    onUpdateGameState,
    promptBoardConflictReload,
    resetPromptedConflict,
    showToast,
    stagedOrderIds,
    stagedOrders,
    stagedOwnership,
    stagedUnits,
    syncFromState,
  ]);

  const confirmIfDirty = useCallback(
    async (actionDescription = 'leave'): Promise<boolean> => {
      if (!directEditActive || !isDirty) return true;
      const ok = await confirm(
        buildDiscardEditsConfirmOptions(diffLines.length, actionDescription),
      );
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
    if (!gameState || !directEditActive || !baseState) return gameState;
    return {
      ...gameState,
      units: stagedUnits,
      ownership: stagedOwnership,
      orders: stagedOrders,
    };
  }, [
    baseState,
    directEditActive,
    gameState,
    stagedOrders,
    stagedOwnership,
    stagedUnits,
  ]);

  const {
    unacknowledgedAdminEntries,
    acknowledgingAdminEntries,
    handleAcknowledgeAdminEntries,
  } = useAdminAcknowledgement({
    activeGameId,
    viewMode,
    lockedPower,
    gameState,
    authUser,
    onUpdateGameState,
  });

  const clearStagedChanges = useCallback(async () => {
    if (!isDirty) return;
    const ok = await confirm(buildClearEditsConfirmOptions(diffLines.length));
    if (ok) discardChanges();
  }, [confirm, diffLines.length, discardChanges, isDirty]);

  const undoStagedChange = useCallback(
    (changeId: string) => {
      const reverted = applyUndoStagedChange(
        baseState ?? gameState,
        stagedUnits,
        stagedOwnership,
        stagedOrders,
        changeId,
      );
      setStagedUnits(reverted.units);
      setStagedOwnership(reverted.ownership);
      setStagedOrders(reverted.orders);
      const dropId = getRevertedOrderUnitId(changeId);
      if (dropId) dropStagedOrderIds(dropId);
      if (
        relocatingUnitId &&
        !reverted.units.some((u) => u.id === relocatingUnitId)
      ) {
        setRelocatingUnitId(null);
      }
    },
    [
      baseState,
      dropStagedOrderIds,
      gameState,
      relocatingUnitId,
      stagedOrders,
      stagedOwnership,
      stagedUnits,
    ],
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
