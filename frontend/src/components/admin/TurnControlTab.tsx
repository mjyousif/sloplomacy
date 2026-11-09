import { Calendar, Check, RotateCcw, Undo2, Unlock } from 'lucide-react';
import type React from 'react';

export interface TurnControlTabProps {
  canRollback: boolean;
  historyCount: number;
  loading: boolean;
  handleRollback: (event: React.MouseEvent) => void | Promise<void>;
  selectedSeason: string;
  setSelectedSeason: (val: string) => void;
  selectedYear: number;
  setSelectedYear: (val: number) => void;
  selectedPhase: string;
  setSelectedPhase: (val: string) => void;
  handleSetTurn: () => void;
  handleUnfinalizeAll: () => void;
}

export const TurnControlTab: React.FC<TurnControlTabProps> = ({
  canRollback,
  historyCount,
  loading,
  handleRollback,
  selectedSeason,
  setSelectedSeason,
  selectedYear,
  setSelectedYear,
  selectedPhase,
  setSelectedPhase,
  handleSetTurn,
  handleUnfinalizeAll,
}) => {
  return (
    <div className="admin-tab-panel">
      <div className="admin-card-section">
        <div className="admin-card-title-row">
          <Undo2 size={16} className="section-icon-gold" />
          <h4>Roll Back Adjudicated Turn</h4>
        </div>
        <p className="admin-section-desc">
          Revert to the state immediately before the last adjudication. Use this
          if a player forgot to enter orders, or an unintended turn advance
          occurred.
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
            data-testid="btn-admin-rollback"
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
          Directly adjust the current season, year, or phase to fix scheduling
          or timeline mistakes.
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
              onChange={(e) =>
                setSelectedYear(parseInt(e.target.value, 10) || 1901)
              }
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
          If powers have locked / finalized their turns, unlock them all so
          players can freely edit and re-confirm their orders.
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
  );
};
