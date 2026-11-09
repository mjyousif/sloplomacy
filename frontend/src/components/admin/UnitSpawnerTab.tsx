import { PlusCircle, Trash2 } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type GameState,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type Unit,
  type UnitType,
} from '../../types/diplomacy';

export interface UnitSpawnerTabProps {
  spawnPower: Power;
  setSpawnPower: (val: Power) => void;
  spawnUnitType: UnitType;
  setSpawnUnitType: (val: UnitType) => void;
  spawnProvince: string;
  setSpawnProvince: (val: string) => void;
  spawnCoast: string;
  setSpawnCoast: (val: string) => void;
  spawnProvInfo: ProvinceInfo | undefined;
  sortedProvinces: ProvinceInfo[];
  loading: boolean;
  handleSpawnUnit: () => void;
  destroyFilterPower: string;
  setDestroyFilterPower: (val: string) => void;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  filteredUnitsToDestroy: Unit[];
  handleDestroyUnit: (
    unit: Unit,
    event: React.MouseEvent,
  ) => void | Promise<void>;
}

export const UnitSpawnerTab: React.FC<UnitSpawnerTabProps> = ({
  spawnPower,
  setSpawnPower,
  spawnUnitType,
  setSpawnUnitType,
  spawnProvince,
  setSpawnProvince,
  spawnCoast,
  setSpawnCoast,
  spawnProvInfo,
  sortedProvinces,
  loading,
  handleSpawnUnit,
  destroyFilterPower,
  setDestroyFilterPower,
  gameState,
  provinces,
  filteredUnitsToDestroy,
  handleDestroyUnit,
}) => {
  return (
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

        {spawnProvInfo &&
          spawnProvInfo.coasts &&
          spawnProvInfo.coasts.length > 0 &&
          spawnUnitType === 'F' && (
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
          Immediately delete any unit from the board. Useful if an extra unit
          was spawned or dislodged erroneously.
        </p>

        <div className="admin-filter-bar">
          <label>Filter by Country:</label>
          <select
            value={destroyFilterPower}
            onChange={(e) => setDestroyFilterPower(e.target.value)}
          >
            <option value="ALL">
              All Great Powers ({gameState.units.length} units)
            </option>
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
                    {u.coast ? ` (${u.coast})` : ''} —{' '}
                    {prov?.name || u.province}
                  </span>
                </div>
                <button
                  type="button"
                  className="admin-destroy-btn"
                  disabled={loading}
                  onClick={(e) => handleDestroyUnit(u, e)}
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
  );
};
