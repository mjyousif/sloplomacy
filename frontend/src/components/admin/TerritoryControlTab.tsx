import { Check, MapPin, RefreshCw } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type GameState,
  POWER_METADATA,
  type ProvinceInfo,
} from '../../types/diplomacy';
import type { ConfirmOptions } from '../ConfirmModal';

export interface TerritoryControlTabProps {
  territoryProvince: string;
  setTerritoryProvince: (val: string) => void;
  territoryOwner: string;
  setTerritoryOwner: (val: string) => void;
  sortedProvinces: ProvinceInfo[];
  gameState: GameState;
  loading: boolean;
  handleSetOwnership: () => void;
  onResetScenario?: () => void;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  onClose: () => void;
}

export const TerritoryControlTab: React.FC<TerritoryControlTabProps> = ({
  territoryProvince,
  setTerritoryProvince,
  territoryOwner,
  setTerritoryOwner,
  sortedProvinces,
  gameState,
  loading,
  handleSetOwnership,
  onResetScenario,
  confirm,
  onClose,
}) => {
  return (
    <div className="admin-tab-panel">
      <div className="admin-card-section">
        <div className="admin-card-title-row">
          <MapPin size={16} className="section-icon-gold" />
          <h4>Supply Center &amp; Province Ownership</h4>
        </div>
        <p className="admin-section-desc">
          Arbitrarily reassign province controller/ownership. Useful for fixing
          supply center capture errors.
        </p>

        <div className="admin-form-grid-2">
          <div className="admin-form-group">
            <label>Province</label>
            <select
              value={territoryProvince}
              onChange={(e) => setTerritoryProvince(e.target.value)}
            >
              {sortedProvinces
                .filter((p) => p.is_supply_center)
                .map((p) => {
                  const currentOwner = gameState.ownership[p.id];
                  return (
                    <option key={p.id} value={p.id}>
                      {p.id} — {p.name} [
                      {currentOwner
                        ? POWER_METADATA[currentOwner].shortName
                        : 'Neutral'}
                      ]
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
            Reset this entire board state back to the standard Spring 1901
            starting layout.
          </p>
          <button
            type="button"
            className="admin-danger-outline-btn"
            onClick={async (e) => {
              const ok = await confirm(
                {
                  title: 'Reset to Spring 1901?',
                  message:
                    'This game goes back to the standard Spring 1901 layout. All orders and moves will be reset.',
                  confirmLabel: 'Reset game',
                },
                e,
              );
              if (ok) {
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
  );
};
