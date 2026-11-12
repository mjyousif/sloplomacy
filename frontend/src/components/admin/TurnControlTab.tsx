import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Undo2,
  Unlock,
} from 'lucide-react';
import type React from 'react';
import type { TurnHistoryEntry } from '../../types/diplomacy';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from '../map/hud/IconSelectDropdown';

const SEASON_OPTIONS: IconSelectOption[] = [
  {
    value: 'Spring',
    label: 'Spring',
    testId: 'select-admin-season-option-spring',
  },
  { value: 'Fall', label: 'Fall', testId: 'select-admin-season-option-fall' },
  {
    value: 'Winter',
    label: 'Winter',
    testId: 'select-admin-season-option-winter',
  },
];

const PHASE_OPTIONS: IconSelectOption[] = [
  {
    value: 'Movement',
    label: 'Movement',
    testId: 'select-admin-phase-option-movement',
  },
  {
    value: 'Retreats',
    label: 'Retreats',
    testId: 'select-admin-phase-option-retreats',
  },
  {
    value: 'Adjustments',
    label: 'Adjustments',
    testId: 'select-admin-phase-option-adjustments',
  },
];

export interface TurnControlTabProps {
  canRollback: boolean;
  historyEntries?: TurnHistoryEntry[];
  selectedSnapshotIndex?: number | null;
  onSelectSnapshotIndex?: (index: number) => void;
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
  historyEntries = [],
  selectedSnapshotIndex = null,
  onSelectSnapshotIndex,
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
  const snapshotOptions: IconSelectOption[] = [...historyEntries]
    .reverse()
    .map((entry) => ({
      value: String(entry.index),
      label: `${entry.season} ${entry.year} ${entry.phase}`,
      testId: `select-admin-rollback-snapshot-option-${entry.index}`,
    }));

  return (
    <div className="admin-tab-panel">
      <div className="admin-card-section">
        <div className="admin-card-title-row">
          <Undo2 size={16} className="section-icon-gold" />
          <h4>Revert to Past Turn</h4>
        </div>
        <p className="admin-section-desc">
          Revert the game to a previously played turn snapshot.
        </p>

        <div className="admin-rollback-action-box">
          <div className="admin-rollback-select-group">
            <IconSelectDropdown
              id="admin-rollback-snapshot-select"
              testId="select-admin-rollback-snapshot"
              value={
                selectedSnapshotIndex !== null
                  ? String(selectedSnapshotIndex)
                  : null
              }
              options={snapshotOptions}
              disabled={!canRollback || snapshotOptions.length === 0 || loading}
              placeholder="No snapshots available"
              onChange={(val) => {
                if (val !== null && onSelectSnapshotIndex) {
                  onSelectSnapshotIndex(Number(val));
                }
              }}
            />
          </div>
          <button
            type="button"
            data-testid="btn-admin-rollback"
            className="admin-secondary-btn rollback"
            disabled={
              !canRollback ||
              loading ||
              (snapshotOptions.length > 0 && selectedSnapshotIndex === null)
            }
            onClick={handleRollback}
          >
            <RotateCcw size={15} />
            <span>Revert</span>
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
            <label htmlFor="admin-clock-season-select">Season</label>
            <IconSelectDropdown
              id="admin-clock-season-select"
              testId="select-admin-season"
              value={selectedSeason}
              options={SEASON_OPTIONS}
              onChange={(val) => {
                if (val) setSelectedSeason(val);
              }}
            />
          </div>
          <div className="admin-form-group">
            <label htmlFor="admin-clock-year-input">Year</label>
            <div className="admin-year-stepper">
              <input
                id="admin-clock-year-input"
                type="number"
                data-testid="input-admin-year"
                className="admin-year-input"
                min={1901}
                max={1950}
                value={selectedYear}
                onChange={(e) =>
                  setSelectedYear(parseInt(e.target.value, 10) || 1901)
                }
              />
              <div className="admin-year-stepper-btns">
                <button
                  type="button"
                  data-testid="btn-admin-year-up"
                  className="admin-year-step-btn"
                  aria-label="Increase year"
                  disabled={selectedYear >= 1950}
                  onClick={() =>
                    setSelectedYear(Math.min(1950, (selectedYear || 1901) + 1))
                  }
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  type="button"
                  data-testid="btn-admin-year-down"
                  className="admin-year-step-btn"
                  aria-label="Decrease year"
                  disabled={selectedYear <= 1901}
                  onClick={() =>
                    setSelectedYear(Math.max(1901, (selectedYear || 1901) - 1))
                  }
                >
                  <ChevronDown size={11} />
                </button>
              </div>
            </div>
          </div>
          <div className="admin-form-group">
            <label htmlFor="admin-clock-phase-select">Phase</label>
            <IconSelectDropdown
              id="admin-clock-phase-select"
              testId="select-admin-phase"
              value={selectedPhase}
              options={PHASE_OPTIONS}
              onChange={(val) => {
                if (val) setSelectedPhase(val);
              }}
            />
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
            <span>Apply</span>
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
          <span>Unlock All Orders</span>
        </button>
      </div>
    </div>
  );
};
