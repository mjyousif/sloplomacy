import { ArrowRight } from 'lucide-react';
import type React from 'react';
import {
  type GameState,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
} from '../../types/diplomacy';

export interface UnitTeleportTabProps {
  moveUnitId: string;
  setMoveUnitId: (val: string) => void;
  moveTargetProvince: string;
  setMoveTargetProvince: (val: string) => void;
  moveTargetCoast: string;
  setMoveTargetCoast: (val: string) => void;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  sortedProvinces: ProvinceInfo[];
  selectedMoveUnit: Unit | undefined;
  moveProvInfo: ProvinceInfo | undefined;
  loading: boolean;
  handleMoveUnit: () => void;
}

export const UnitTeleportTab: React.FC<UnitTeleportTabProps> = ({
  moveUnitId,
  setMoveUnitId,
  moveTargetProvince,
  setMoveTargetProvince,
  moveTargetCoast,
  setMoveTargetCoast,
  gameState,
  provinces,
  sortedProvinces,
  selectedMoveUnit,
  moveProvInfo,
  loading,
  handleMoveUnit,
}) => {
  return (
    <div className="admin-tab-panel">
      <div className="admin-card-section">
        <div className="admin-card-title-row">
          <ArrowRight size={16} className="section-icon-gold" />
          <h4>Relocate / Teleport Any Unit</h4>
        </div>
        <p className="admin-section-desc">
          Move any existing unit anywhere on the board. Bypasses regular
          adjacency and movement rules to fix erroneous unit placements.
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
                    {pMeta.shortName} {u.unit_type === 'A' ? 'Army' : 'Fleet'} —{' '}
                    {u.province} ({prov?.name || u.province})
                    {u.coast ? ` [${u.coast}]` : ''}
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

        {moveProvInfo &&
          moveProvInfo.coasts &&
          moveProvInfo.coasts.length > 0 &&
          selectedMoveUnit?.unit_type === 'F' && (
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
  );
};
