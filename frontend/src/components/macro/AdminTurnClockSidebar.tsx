import { AlertTriangle, PanelRightClose, Wrench } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/supabase';
import type {
  AdminStatusResponse,
  AuthUser,
  GameState,
  Power,
  TurnHistoryEntry,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { OrderProgress } from '../../utils/orderProgress';
import type { SheetSnap } from '../../utils/sheetHelpers';
import { TurnControlTab } from '../admin/TurnControlTab';
import { BottomSheet } from '../BottomSheet';
import { useConfirm } from '../ConfirmModal';
import macroStyles from '../MacroSidebar.module.css';
import { VersionBadge } from '../VersionBadge';
import adminSidebarStyles from './AdminSidebar.module.css';
import styles from './AdminTurnClockSidebar.module.css';
import { CollapsedRail } from './CollapsedRail';

const API_BASE = '/api';

export interface AdminTurnClockSettings {
  isOpen: boolean;
  onClose?: () => void;
  gameId: string;
  gameState: GameState;
  user: AuthUser | null;
  onStateUpdated: (newState: GameState) => void;
  onToast: (msg: string) => void;
}

export interface AdminTurnClockSidebarProps {
  variant: 'panel' | 'sheet';
  sheetSnap: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  activePower: Power;
  progress: OrderProgress;
  settings: AdminTurnClockSettings;
}

/**
 * Repurposes the right sidebar (or phone bottom sheet) into the Turn and Clock Settings
 * administrator panel when opened from the top bar Wrench menu.
 */
export function AdminTurnClockSidebar({
  variant,
  sheetSnap,
  onSheetSnapChange,
  collapsed,
  onToggleCollapse,
  activePower,
  progress,
  settings,
}: AdminTurnClockSidebarProps) {
  const { isOpen, gameId, gameState, user, onStateUpdated, onToast } = settings;

  const [historyEntries, setHistoryEntries] = useState<TurnHistoryEntry[]>([]);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<
    number | null
  >(null);
  const [canRollback, setCanRollback] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, confirmModal } = useConfirm();

  const [selectedSeason, setSelectedSeason] = useState<string>(
    gameState.season,
  );
  const [selectedYear, setSelectedYear] = useState<number>(gameState.year);
  const [selectedPhase, setSelectedPhase] = useState<string>(gameState.phase);

  const getHeaders = useCallback(async () => {
    const authHeaders = await getAuthHeaders();
    return {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(user?.id ? { 'X-User-Id': user.id } : {}),
      ...(user?.email ? { 'X-User-Email': user.email } : {}),
    };
  }, [user?.id, user?.email]);

  const fetchAdminStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/admin/status?game_id=${encodeURIComponent(gameId)}`,
        { headers: await getHeaders() },
      );
      if (res.ok) {
        const data: AdminStatusResponse = await res.json();
        const entries = data.history_entries ?? [];
        setHistoryEntries(entries);
        setSelectedSnapshotIndex(
          entries.length > 0 ? entries[entries.length - 1].index : null,
        );
        setCanRollback(data.can_rollback);
      }
    } catch (e) {
      console.error('Failed to fetch admin status:', e);
    }
  }, [gameId, getHeaders]);

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

  const handleRollback = async (event: React.MouseEvent) => {
    if (!canRollback) return;
    const selectedEntry = historyEntries.find(
      (entry) => entry.index === selectedSnapshotIndex,
    );
    const targetLabel = selectedEntry
      ? `${selectedEntry.season} ${selectedEntry.year} ${selectedEntry.phase}`
      : null;
    const ok = await confirm(
      {
        title: targetLabel
          ? `Roll back to ${targetLabel}?`
          : 'Roll back to the previous turn?',
        message: targetLabel
          ? `The game returns to the ${targetLabel} snapshot. Any moves or turns after it will be reverted.`
          : 'The game returns to the previous turn state. Any moves or changes in the current turn will be reverted.',
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
          body: JSON.stringify({
            ...(selectedSnapshotIndex !== null
              ? { snapshot_index: selectedSnapshotIndex }
              : {}),
            user_id: user?.id || 'guest',
            email: user?.email || 'commander@diplomacy.local',
          }),
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
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : 'Network error executing rollback.',
      );
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
            user_id: user?.id || 'guest',
            email: user?.email || 'commander@diplomacy.local',
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
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : 'Network error setting turn.',
      );
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
          body: JSON.stringify({
            user_id: user?.id || 'guest',
            email: user?.email || 'commander@diplomacy.local',
          }),
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
    } catch (e: unknown) {
      setActionError(
        e instanceof Error ? e.message : 'Network error unlocking powers.',
      );
    } finally {
      setLoading(false);
    }
  };

  const bodyContent = (
    <div
      className={styles.adminTurnClockSidebarBody}
      data-testid="admin-tools-modal"
    >
      {actionError && (
        <div className={styles.adminErrorBanner}>
          <AlertTriangle size={15} />
          <span>{actionError}</span>
        </div>
      )}
      <TurnControlTab
        canRollback={canRollback}
        historyEntries={historyEntries}
        selectedSnapshotIndex={selectedSnapshotIndex}
        onSelectSnapshotIndex={setSelectedSnapshotIndex}
        loading={loading}
        handleRollback={handleRollback}
        selectedSeason={selectedSeason}
        setSelectedSeason={setSelectedSeason}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedPhase={selectedPhase}
        setSelectedPhase={setSelectedPhase}
        handleSetTurn={handleSetTurn}
        handleUnfinalizeAll={handleUnfinalizeAll}
      />
      {confirmModal}
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={(snap) => onSheetSnapChange?.(snap)}
        label="Turn and Clock Settings"
        testId="macro-sidebar"
        peek={
          <div
            className={cx(macroStyles.macroSheetPeek, 'admin-sheet-peek')}
            style={{ borderLeftColor: '#b91c1c' }}
          >
            <div className={adminSidebarStyles.adminSidebarHeaderRow}>
              <div className={adminSidebarStyles.adminSidebarTitle}>
                <Wrench
                  size={15}
                  className={adminSidebarStyles.adminSidebarIcon}
                />
                <strong>Turn and Clock Settings</strong>
              </div>
            </div>
          </div>
        }
      >
        <div className={macroStyles.macroSheetBody}>
          <div className={macroStyles.macroUnitsScrollArea}>{bodyContent}</div>
          <div className="sidebar-version-footer">
            <VersionBadge />
          </div>
        </div>
      </BottomSheet>
    );
  }

  if (collapsed) {
    return (
      <aside
        className={macroStyles.macroSidebar}
        data-collapsed="true"
        aria-label="Turn and Clock Settings Collapsed"
      >
        <CollapsedRail
          activePower={activePower}
          progress={progress}
          onToggleCollapse={onToggleCollapse}
          adminMode="turn-clock"
        />
      </aside>
    );
  }

  return (
    <aside
      className={cx(
        macroStyles.macroSidebar,
        'admin-direct-edit-sidebar',
        'admin-turn-clock-sidebar',
      )}
      data-expanded="true"
      data-testid="macro-sidebar"
      aria-label="Turn and Clock Settings"
    >
      <div
        className={cx(
          macroStyles.activePowerBanner,
          adminSidebarStyles.adminSidebarBanner,
        )}
        style={{ borderLeft: '4px solid #b91c1c' }}
      >
        <div className={adminSidebarStyles.adminSidebarHeaderRow}>
          <div className={adminSidebarStyles.adminSidebarTitle}>
            <Wrench size={16} className={adminSidebarStyles.adminSidebarIcon} />
            <h2 className={adminSidebarStyles.adminSidebarHeading}>
              Turn and Clock Settings
            </h2>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-collapse-toggle-btn"
              onClick={onToggleCollapse}
              title="Collapse Right Sidebar"
              aria-label="Collapse Right Sidebar"
            >
              <PanelRightClose size={15} />
            </button>
          )}
        </div>
      </div>

      <div className={macroStyles.macroUnitsScrollArea}>{bodyContent}</div>

      <div className="sidebar-version-footer">
        <VersionBadge />
      </div>
    </aside>
  );
}
