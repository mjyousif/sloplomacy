import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Crown,
  MapPin,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Sliders,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../lib/supabase';
import {
  type AuthUser,
  type GameState,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type Unit,
  type UnitType,
} from '../types/diplomacy';
import { TerritoryControlTab } from './admin/TerritoryControlTab';
import { TurnControlTab } from './admin/TurnControlTab';
import { UnitSpawnerTab } from './admin/UnitSpawnerTab';
import { UnitTeleportTab } from './admin/UnitTeleportTab';
import { useConfirm } from './ConfirmModal';

const API_BASE = '/api';

interface AdminToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  user: AuthUser | null;
  onStateUpdated: (newState: GameState) => void;
  onToast: (msg: string) => void;
  adminOverrideActive: boolean;
  onToggleAdminOverride: () => void;
  onResetScenario?: () => void;
}

type TabType = 'turn' | 'move' | 'spawn' | 'territory';

export const AdminToolsModal: React.FC<AdminToolsModalProps> = ({
  isOpen,
  onClose,
  gameId,
  gameState,
  provinces,
  user,
  onStateUpdated,
  onToast,
  adminOverrideActive,
  onToggleAdminOverride,
  onResetScenario,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('turn');
  const [historyCount, setHistoryCount] = useState<number>(0);
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
  const _turnKey = `${gameState.season}|${gameState.year}|${gameState.phase}`;
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

  if (!isOpen) return null;

  const sortedProvinces = Object.values(provinces).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const selectedMoveUnit = gameState.units.find((u) => u.id === moveUnitId);
  const moveProvInfo = provinces[moveTargetProvince];
  const spawnProvInfo = provinces[spawnProvince];

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

  const filteredUnitsToDestroy = gameState.units.filter((u) => {
    if (destroyFilterPower === 'ALL') return true;
    return u.power === destroyFilterPower;
  });

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
                title="Toggle unrestricted direct clicking on map and sidebar to edit foreign moves"
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
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'turn' ? 'active' : ''}`}
              onClick={() => setActiveTab('turn')}
            >
              <RotateCcw size={14} />
              <span>Turn Rollback &amp; Clock</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'move' ? 'active' : ''}`}
              onClick={() => setActiveTab('move')}
            >
              <ArrowRight size={14} />
              <span>Move Units Anywhere</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'spawn' ? 'active' : ''}`}
              onClick={() => setActiveTab('spawn')}
            >
              <PlusCircle size={14} />
              <span>Spawn / Destroy Units</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'territory' ? 'active' : ''}`}
              onClick={() => setActiveTab('territory')}
            >
              <MapPin size={14} />
              <span>Territory &amp; Powers</span>
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div className="admin-tab-body">
            {/* TAB 1: TURN ROLLBACK & CLOCK */}
            {activeTab === 'turn' && (
              <TurnControlTab
                canRollback={canRollback}
                historyCount={historyCount}
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
            )}

            {/* TAB 2: MOVE UNITS ANYWHERE */}
            {activeTab === 'move' && (
              <UnitTeleportTab
                moveUnitId={moveUnitId}
                setMoveUnitId={setMoveUnitId}
                moveTargetProvince={moveTargetProvince}
                setMoveTargetProvince={setMoveTargetProvince}
                moveTargetCoast={moveTargetCoast}
                setMoveTargetCoast={setMoveTargetCoast}
                gameState={gameState}
                provinces={provinces}
                sortedProvinces={sortedProvinces}
                selectedMoveUnit={selectedMoveUnit}
                moveProvInfo={moveProvInfo}
                loading={loading}
                handleMoveUnit={handleMoveUnit}
              />
            )}

            {/* TAB 3: SPAWN / DESTROY UNITS */}
            {activeTab === 'spawn' && (
              <UnitSpawnerTab
                spawnPower={spawnPower}
                setSpawnPower={setSpawnPower}
                spawnUnitType={spawnUnitType}
                setSpawnUnitType={setSpawnUnitType}
                spawnProvince={spawnProvince}
                setSpawnProvince={setSpawnProvince}
                spawnCoast={spawnCoast}
                setSpawnCoast={setSpawnCoast}
                spawnProvInfo={spawnProvInfo}
                sortedProvinces={sortedProvinces}
                loading={loading}
                handleSpawnUnit={handleSpawnUnit}
                destroyFilterPower={destroyFilterPower}
                setDestroyFilterPower={setDestroyFilterPower}
                gameState={gameState}
                provinces={provinces}
                filteredUnitsToDestroy={filteredUnitsToDestroy}
                handleDestroyUnit={handleDestroyUnit}
              />
            )}

            {/* TAB 4: TERRITORY & POWERS */}
            {activeTab === 'territory' && (
              <TerritoryControlTab
                territoryProvince={territoryProvince}
                setTerritoryProvince={setTerritoryProvince}
                territoryOwner={territoryOwner}
                setTerritoryOwner={setTerritoryOwner}
                sortedProvinces={sortedProvinces}
                gameState={gameState}
                loading={loading}
                handleSetOwnership={handleSetOwnership}
                onResetScenario={onResetScenario}
                confirm={confirm}
                onClose={onClose}
              />
            )}
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
