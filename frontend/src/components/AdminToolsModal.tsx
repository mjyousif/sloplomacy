import React, { useEffect, useState } from 'react';
import {
  ALL_POWERS,
  AuthUser,
  GameState,
  POWER_METADATA,
  Power,
  ProvinceInfo,
  Unit,
  UnitType,
} from '../types/diplomacy';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  Compass,
  Crown,
  MapPin,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Unlock,
  Wrench,
  X,
} from 'lucide-react';

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

  // Time & Turn Form State
  const [selectedSeason, setSelectedSeason] = useState<string>(gameState.season);
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

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...(user?.id ? { 'X-User-Id': user.id } : {}),
    ...(user?.email ? { 'X-User-Email': user.email } : {}),
  });

  const fetchAdminStatus = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/admin/status?game_id=${encodeURIComponent(gameId)}`,
        { headers: getHeaders() }
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

  useEffect(() => {
    if (isOpen) {
      fetchAdminStatus();
      setSelectedSeason(gameState.season);
      setSelectedYear(gameState.year);
      setSelectedPhase(gameState.phase);
      if (gameState.units.length > 0 && !moveUnitId) {
        setMoveUnitId(gameState.units[0].id);
      }
      setActionError(null);
    }
  }, [isOpen, gameId, gameState]);

  if (!isOpen) return null;

  const sortedProvinces = Object.values(provinces).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const selectedMoveUnit = gameState.units.find((u) => u.id === moveUnitId);
  const moveProvInfo = provinces[moveTargetProvince];
  const spawnProvInfo = provinces[spawnProvince];

  const handleRollback = async () => {
    if (!canRollback) return;
    if (
      !window.confirm(
        'Roll back the game to the previous turn state? Any moves or changes in the current turn will be reverted.'
      )
    ) {
      return;
    }
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/rollback?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ user_id: user?.id, email: user?.email }),
        }
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
          headers: getHeaders(),
          body: JSON.stringify({
            season: selectedSeason,
            year: selectedYear,
            phase: selectedPhase,
            user_id: user?.id,
            email: user?.email,
          }),
        }
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
          headers: getHeaders(),
          body: JSON.stringify({ user_id: user?.id, email: user?.email }),
        }
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
          headers: getHeaders(),
          body: JSON.stringify({
            unit_id: moveUnitId,
            new_province: moveTargetProvince,
            new_coast: moveTargetCoast || null,
            user_id: user?.id,
            email: user?.email,
          }),
        }
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
          headers: getHeaders(),
          body: JSON.stringify({
            power: spawnPower,
            unit_type: spawnUnitType,
            province: spawnProvince,
            coast: spawnCoast || null,
            user_id: user?.id,
            email: user?.email,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || 'Failed to spawn unit.');
        return;
      }
      const st: GameState = await res.json();
      onStateUpdated(st);
      onToast(`Spawned ${POWER_METADATA[spawnPower].shortName} ${spawnUnitType === 'A' ? 'Army' : 'Fleet'} in ${spawnProvince}!`);
    } catch (e: any) {
      setActionError(e.message || 'Network error spawning unit.');
    } finally {
      setLoading(false);
    }
  };

  const handleDestroyUnit = async (unit: Unit) => {
    if (
      !window.confirm(
        `Are you sure you want to destroy ${POWER_METADATA[unit.power].shortName} ${
          unit.unit_type === 'A' ? 'Army' : 'Fleet'
        } in ${unit.province}?`
      )
    ) {
      return;
    }
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/unit/destroy?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            unit_id: unit.id,
            user_id: user?.id,
            email: user?.email,
          }),
        }
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
      const pwr = territoryOwner === 'NEUTRAL' ? null : (territoryOwner as Power);
      const res = await fetch(
        `${API_BASE}/admin/ownership?game_id=${encodeURIComponent(gameId)}`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            province: territoryProvince,
            power: pwr,
            user_id: user?.id,
            email: user?.email,
          }),
        }
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
        }!`
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
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card"
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
              <span>{historyCount} snapshot{historyCount === 1 ? '' : 's'} in timeline</span>
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
                Map Direct-Edit Mode: {adminOverrideActive ? 'ENABLED' : 'DISABLED'}
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
            <div className="admin-tab-panel">
              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <Undo2 size={16} className="section-icon-gold" />
                  <h4>Roll Back Adjudicated Turn</h4>
                </div>
                <p className="admin-section-desc">
                  Revert to the state immediately before the last adjudication. Use this if a player forgot to enter orders, or an unintended turn advance occurred.
                </p>

                <div className="admin-rollback-action-box">
                  <div>
                    <span className="rollback-status-text">
                      {canRollback
                        ? `Previous snapshot is ready to restore (${historyCount} saved).`
                        : 'No previous turn history available (game is at initial state).'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="admin-primary-btn rollback"
                    disabled={!canRollback || loading}
                    onClick={handleRollback}
                  >
                    <RotateCcw size={15} />
                    <span>Roll Back to Previous Turn</span>
                  </button>
                </div>
              </div>

              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <Calendar size={16} className="section-icon-gold" />
                  <h4>Adjust Game Clock &amp; Season</h4>
                </div>
                <p className="admin-section-desc">
                  Directly adjust the current season, year, or phase to fix scheduling or timeline mistakes.
                </p>

                <div className="admin-form-grid-3">
                  <div className="admin-form-group">
                    <label>Season</label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(e.target.value)}
                    >
                      <option value="Spring">Spring</option>
                      <option value="Fall">Fall</option>
                      <option value="Winter">Winter</option>
                    </select>
                  </div>
                  <div className="admin-form-group">
                    <label>Year</label>
                    <input
                      type="number"
                      min={1901}
                      max={1950}
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value) || 1901)}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label>Phase</label>
                    <select
                      value={selectedPhase}
                      onChange={(e) => setSelectedPhase(e.target.value)}
                    >
                      <option value="Movement">Movement</option>
                      <option value="Retreats">Retreats</option>
                      <option value="Adjustments">Adjustments</option>
                    </select>
                  </div>
                </div>

                <div className="admin-form-actions-row">
                  <button
                    type="button"
                    className="admin-secondary-btn"
                    disabled={loading}
                    onClick={handleSetTurn}
                  >
                    <Check size={14} />
                    <span>Apply Clock Changes</span>
                  </button>
                </div>
              </div>

              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <Unlock size={16} className="section-icon-gold" />
                  <h4>Unlock All Power Orders</h4>
                </div>
                <p className="admin-section-desc">
                  If powers have locked / finalized their turns, unlock them all so players can freely edit and re-confirm their orders.
                </p>
                <button
                  type="button"
                  className="admin-secondary-btn"
                  disabled={loading}
                  onClick={handleUnfinalizeAll}
                >
                  <Unlock size={14} />
                  <span>Unlock / Unfinalize All Powers</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: MOVE UNITS ANYWHERE */}
          {activeTab === 'move' && (
            <div className="admin-tab-panel">
              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <ArrowRight size={16} className="section-icon-gold" />
                  <h4>Relocate / Teleport Any Unit</h4>
                </div>
                <p className="admin-section-desc">
                  Move any existing unit anywhere on the board. Bypasses regular adjacency and movement rules to fix erroneous unit placements.
                </p>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label>Select Unit on Board</label>
                    <select
                      value={moveUnitId}
                      onChange={(e) => setMoveUnitId(e.target.value)}
                    >
                      {gameState.units.map((u) => {
                        const pMeta = POWER_METADATA[u.power];
                        const prov = provinces[u.province];
                        return (
                          <option key={u.id} value={u.id}>
                            {pMeta.shortName} {u.unit_type === 'A' ? 'Army' : 'Fleet'} — {u.province} ({prov?.name || u.province}){u.coast ? ` [${u.coast}]` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label>Destination Province</label>
                    <select
                      value={moveTargetProvince}
                      onChange={(e) => {
                        setMoveTargetProvince(e.target.value);
                        setMoveTargetCoast('');
                      }}
                    >
                      {sortedProvinces.map((p) => {
                        return (
                          <option key={p.id} value={p.id}>
                            {p.id} — {p.name} ({p.type})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {moveProvInfo && moveProvInfo.coasts && moveProvInfo.coasts.length > 0 && selectedMoveUnit?.unit_type === 'F' && (
                  <div className="admin-form-group" style={{ marginTop: 12 }}>
                    <label>Fleet Coast in {moveProvInfo.name}</label>
                    <select
                      value={moveTargetCoast || moveProvInfo.coasts[0]}
                      onChange={(e) => setMoveTargetCoast(e.target.value)}
                    >
                      {moveProvInfo.coasts.map((c) => (
                        <option key={c} value={c}>
                          {c} Coast
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="admin-relocate-preview">
                  {selectedMoveUnit && moveProvInfo && (
                    <span>
                      Relocating{' '}
                      <strong>
                        {POWER_METADATA[selectedMoveUnit.power].shortName}{' '}
                        {selectedMoveUnit.unit_type === 'A' ? 'Army' : 'Fleet'}
                      </strong>{' '}
                      from <strong>{selectedMoveUnit.province}</strong> to{' '}
                      <strong>
                        {moveProvInfo.name} ({moveTargetProvince})
                      </strong>
                      .
                    </span>
                  )}
                </div>

                <div className="admin-form-actions-row">
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={!moveUnitId || loading}
                    onClick={handleMoveUnit}
                  >
                    <ArrowRight size={14} />
                    <span>Relocate Unit Now</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SPAWN / DESTROY UNITS */}
          {activeTab === 'spawn' && (
            <div className="admin-tab-panel">
              {/* SECTION A: SPAWN */}
              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <PlusCircle size={16} className="section-icon-gold" />
                  <h4>Spawn New Unit</h4>
                </div>
                <p className="admin-section-desc">
                  Create a unit for any Great Power at any valid location on the board.
                </p>

                <div className="admin-form-grid-3">
                  <div className="admin-form-group">
                    <label>Great Power</label>
                    <select
                      value={spawnPower}
                      onChange={(e) => setSpawnPower(e.target.value as Power)}
                    >
                      {ALL_POWERS.map((p) => (
                        <option key={p} value={p}>
                          {POWER_METADATA[p].name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label>Unit Type</label>
                    <select
                      value={spawnUnitType}
                      onChange={(e) => setSpawnUnitType(e.target.value as UnitType)}
                    >
                      <option value="A">Army (A)</option>
                      <option value="F">Fleet (F)</option>
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label>Province</label>
                    <select
                      value={spawnProvince}
                      onChange={(e) => {
                        setSpawnProvince(e.target.value);
                        setSpawnCoast('');
                      }}
                    >
                      {sortedProvinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {spawnProvInfo && spawnProvInfo.coasts && spawnProvInfo.coasts.length > 0 && spawnUnitType === 'F' && (
                  <div className="admin-form-group" style={{ marginTop: 12 }}>
                    <label>Coast in {spawnProvInfo.name}</label>
                    <select
                      value={spawnCoast || spawnProvInfo.coasts[0]}
                      onChange={(e) => setSpawnCoast(e.target.value)}
                    >
                      {spawnProvInfo.coasts.map((c) => (
                        <option key={c} value={c}>
                          {c} Coast
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="admin-form-actions-row">
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={loading}
                    onClick={handleSpawnUnit}
                  >
                    <PlusCircle size={14} />
                    <span>Spawn Unit</span>
                  </button>
                </div>
              </div>

              {/* SECTION B: DESTROY / DISBAND */}
              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <Trash2 size={16} className="section-icon-crimson" />
                  <h4>Destroy / Disband Units Arbitrarily</h4>
                </div>
                <p className="admin-section-desc">
                  Immediately delete any unit from the board. Useful if an extra unit was spawned or dislodged erroneously.
                </p>

                <div className="admin-filter-bar">
                  <label>Filter by Country:</label>
                  <select
                    value={destroyFilterPower}
                    onChange={(e) => setDestroyFilterPower(e.target.value)}
                  >
                    <option value="ALL">All Great Powers ({gameState.units.length} units)</option>
                    {ALL_POWERS.map((p) => {
                      const count = gameState.units.filter((u) => u.power === p).length;
                      return (
                        <option key={p} value={p}>
                          {POWER_METADATA[p].shortName} ({count} units)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="admin-units-destroy-list">
                  {filteredUnitsToDestroy.map((u) => {
                    const pMeta = POWER_METADATA[u.power];
                    const prov = provinces[u.province];
                    return (
                      <div key={u.id} className="admin-unit-destroy-row">
                        <div className="admin-unit-badge-block">
                          <span
                            className="admin-unit-country-badge"
                            style={{ backgroundColor: pMeta.color }}
                          >
                            {pMeta.crest} {pMeta.shortName}
                          </span>
                          <span className="admin-unit-type-label">
                            {u.unit_type === 'A' ? 'Army' : 'Fleet'} in {u.province}
                            {u.coast ? ` (${u.coast})` : ''} — {prov?.name || u.province}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="admin-destroy-btn"
                          disabled={loading}
                          onClick={() => handleDestroyUnit(u)}
                          title={`Destroy ${pMeta.shortName} unit in ${u.province}`}
                        >
                          <Trash2 size={13} />
                          <span>Destroy</span>
                        </button>
                      </div>
                    );
                  })}
                  {filteredUnitsToDestroy.length === 0 && (
                    <div className="admin-empty-list-notice">
                      No units found matching selection.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TERRITORY & POWERS */}
          {activeTab === 'territory' && (
            <div className="admin-tab-panel">
              <div className="admin-card-section">
                <div className="admin-card-title-row">
                  <MapPin size={16} className="section-icon-gold" />
                  <h4>Supply Center &amp; Province Ownership</h4>
                </div>
                <p className="admin-section-desc">
                  Arbitrarily reassign province controller/ownership. Useful for fixing supply center capture errors.
                </p>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label>Province</label>
                    <select
                      value={territoryProvince}
                      onChange={(e) => setTerritoryProvince(e.target.value)}
                    >
                      {sortedProvinces.filter((p) => p.is_supply_center).map((p) => {
                        const currentOwner = gameState.ownership[p.id];
                        return (
                          <option key={p.id} value={p.id}>
                            {p.id} — {p.name} [
                            {currentOwner ? POWER_METADATA[currentOwner].shortName : 'Neutral'}]
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label>New Owner</label>
                    <select
                      value={territoryOwner}
                      onChange={(e) => setTerritoryOwner(e.target.value)}
                    >
                      <option value="NEUTRAL">Neutral (Unclaimed)</option>
                      {ALL_POWERS.map((p) => (
                        <option key={p} value={p}>
                          {POWER_METADATA[p].name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="admin-form-actions-row">
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={loading}
                    onClick={handleSetOwnership}
                  >
                    <Check size={14} />
                    <span>Set Province Ownership</span>
                  </button>
                </div>
              </div>

              {onResetScenario && (
                <div className="admin-card-section">
                  <div className="admin-card-title-row">
                    <RefreshCw size={16} className="section-icon-crimson" />
                    <h4>Hard Reset Scenario</h4>
                  </div>
                  <p className="admin-section-desc">
                    Reset this entire board state back to the standard Spring 1901 starting layout.
                  </p>
                  <button
                    type="button"
                    className="admin-danger-outline-btn"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Reset this game to initial Spring 1901? All orders and moves will be reset.'
                        )
                      ) {
                        onResetScenario();
                        onClose();
                      }
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>Hard Reset to Standard Spring 1901</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="admin-modal-footer">
          <div className="admin-footer-security-notice">
            <ShieldAlert size={14} />
            <span>Administrator Actions are audited in the imperial turn chronicle.</span>
          </div>
          <button type="button" className="admin-done-btn" onClick={onClose}>
            Done / Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
