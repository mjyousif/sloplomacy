import {
  AlertTriangle,
  Calendar,
  Crown,
  RotateCcw,
  ShieldAlert,
  Sliders,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../lib/supabase';
import type {
  AdminStatusResponse,
  AuthUser,
  GameState,
  ProvinceInfo,
  TurnHistoryEntry,
} from '../types/diplomacy';
import { TurnControlTab } from './admin/TurnControlTab';
import { useConfirm } from './ConfirmModal';

const API_BASE = '/api';

interface AdminToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameState: GameState;
  provinces?: Record<string, ProvinceInfo>;
  user: AuthUser | null;
  onStateUpdated: (newState: GameState) => void;
  onToast: (msg: string) => void;
  adminOverrideActive: boolean;
  onToggleAdminOverride: () => void;
}

export const AdminToolsModal: React.FC<AdminToolsModalProps> = ({
  isOpen,
  onClose,
  gameId,
  gameState,
  user,
  onStateUpdated,
  onToast,
  adminOverrideActive,
  onToggleAdminOverride,
}) => {
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [historyEntries, setHistoryEntries] = useState<TurnHistoryEntry[]>([]);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<
    number | null
  >(null);
  const [canRollback, setCanRollback] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, confirmModal } = useConfirm();

  // Time & Turn Form State
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
        setHistoryCount(data.history_count);
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

  // Reset the turn form only when the console opens or the game reaches another turn.
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

  if (!isOpen) return null;

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

  return (
    <>
      <div className="admin-modal-backdrop" onClick={onClose}>
        <div
          className="admin-modal-card"
          data-testid="admin-tools-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="admin-title"
        >
          {/* HEADER */}
          <div className="admin-modal-header">
            <div className="admin-title-group">
              <div className="admin-emblem-badge">
                <ShieldAlert size={24} />
              </div>
              <div>
                <div className="admin-overline-tag">
                  <Crown size={12} />
                  <span>GAME CREATOR CHANCELLERY • ADMINISTRATOR CONSOLE</span>
                </div>
                <h2 id="admin-title" className="admin-main-title">
                  Imperial State &amp; Turn Arbitrator
                </h2>
              </div>
            </div>
            <button
              type="button"
              className="admin-close-btn"
              onClick={onClose}
              aria-label="Close Admin Modal"
            >
              <X size={20} />
            </button>
          </div>

          {/* OVERRIDE MODE STATUS BANNER */}
          <div className="admin-status-strip">
            <div className="admin-status-left">
              <div className="admin-clock-pill">
                <Calendar size={13} />
                <span>
                  {gameState.season} {gameState.year} — {gameState.phase}
                </span>
              </div>
              <span className="admin-history-badge">
                <RotateCcw size={12} />
                <span>
                  {historyCount} snapshot{historyCount === 1 ? '' : 's'} in
                  timeline
                </span>
              </span>
            </div>

            <div className="admin-status-right">
              <button
                type="button"
                className={`admin-override-toggle-btn ${
                  adminOverrideActive ? 'active' : ''
                }`}
                onClick={onToggleAdminOverride}
                title="Toggle unrestricted direct clicking on map and sidebar to edit units and territory"
              >
                <Sliders size={13} />
                <span>
                  Map Direct-Edit Mode:{' '}
                  {adminOverrideActive ? 'ENABLED' : 'DISABLED'}
                </span>
              </button>
            </div>
          </div>

          {actionError && (
            <div className="admin-error-banner">
              <AlertTriangle size={15} />
              <span>{actionError}</span>
            </div>
          )}

          {/* TABS NAVIGATION */}
          <div className="admin-tabs-nav">
            <button type="button" className="admin-tab-btn active">
              <RotateCcw size={14} />
              <span>Turn Rollback &amp; Clock</span>
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div className="admin-tab-body">
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
          </div>

          {/* FOOTER */}
          <div className="admin-modal-footer">
            <div className="admin-footer-security-notice">
              <ShieldAlert size={14} />
              <span>
                Administrator Actions are audited in the imperial turn
                chronicle.
              </span>
            </div>
            <button
              type="button"
              data-testid="btn-admin-close"
              className="admin-done-btn"
              onClick={onClose}
            >
              Done / Close Console
            </button>
          </div>
        </div>
      </div>
      {confirmModal}
    </>
  );
};
