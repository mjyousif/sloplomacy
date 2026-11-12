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
import { useState } from 'react';
import type { AuthUser, GameState, ProvinceInfo } from '../types/diplomacy';
import { TerritoryControlTab } from './admin/TerritoryControlTab';
import { TurnControlTab } from './admin/TurnControlTab';
import { UnitSpawnerTab } from './admin/UnitSpawnerTab';
import { UnitTeleportTab } from './admin/UnitTeleportTab';
import { useAdminActions } from './admin/useAdminActions';
import { useConfirm } from './ConfirmModal';

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
  const { confirm, confirmModal } = useConfirm();
  const {
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
  } = useAdminActions({
    isOpen,
    gameId,
    gameState,
    user,
    confirm,
    onStateUpdated,
    onToast,
  });

  if (!isOpen) return null;

  const sortedProvinces = Object.values(provinces).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const selectedMoveUnit = gameState.units.find((u) => u.id === moveUnitId);
  const moveProvInfo = provinces[moveTargetProvince];
  const spawnProvInfo = provinces[spawnProvince];

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
