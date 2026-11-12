import { AlertTriangle, ChevronLeft, PanelRightOpen } from 'lucide-react';
import type React from 'react';
import { POWER_METADATA, type Power } from '../../types/diplomacy';
import type { OrderProgress } from '../../utils/orderProgress';
import { PowerFlag } from '../PowerFlag';

/**
 * The contents of the slim desktop rail: the power's crest, how many orders are unconfirmed, and
 * a warning dot. The `<aside>` itself stays in `MacroSidebar`, so collapsing and expanding keep
 * one element and the width transition on `.macro-sidebar` still plays.
 */
export const CollapsedRail: React.FC<{
  activePower: Power;
  progress: OrderProgress;
  onToggleCollapse?: () => void;
}> = ({ activePower, progress, onToggleCollapse }) => {
  const powerMeta = POWER_METADATA[activePower];
  const { myActiveFieldUnits, myIssues, scCountByPower, unconfirmedCount } =
    progress;
  return (
    <>
      {onToggleCollapse && (
        <button
          type="button"
          data-testid="macro-sidebar-expand-btn"
          className="sidebar-rail-btn rail-toggle-btn"
          onClick={onToggleCollapse}
          title="Expand Tactical Command & Orders"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      <div className="rail-divider" />

      <div
        className="rail-power-crest"
        title={`Commanding ${powerMeta.name} (${myActiveFieldUnits.length} Units, ${scCountByPower[activePower]} SC)`}
        style={{ borderColor: powerMeta.color }}
      >
        <PowerFlag power={activePower} width={18} height={12} />
      </div>

      <div
        className="rail-counter-badge"
        title={`${unconfirmedCount} unconfirmed orders`}
      >
        {unconfirmedCount > 0 ? (
          <span className="rail-badge-unconfirmed">{unconfirmedCount}</span>
        ) : (
          <span className="rail-badge-clean">✓</span>
        )}
      </div>

      {myIssues.length > 0 && (
        <div
          className="rail-warn-badge"
          title={`${myIssues.length} tactical issues`}
        >
          <AlertTriangle size={14} />
        </div>
      )}

      <div className="rail-spacer" />

      {onToggleCollapse && (
        <button
          type="button"
          className="sidebar-rail-btn rail-expand-chevron"
          onClick={onToggleCollapse}
          title="Expand Tactical Orders"
        >
          <ChevronLeft size={16} />
        </button>
      )}
    </>
  );
};
