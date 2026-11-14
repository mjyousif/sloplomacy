import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  PanelRightOpen,
  Pencil,
} from 'lucide-react';
import type React from 'react';
import { POWER_METADATA, type Power } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { OrderProgress } from '../../utils/orderProgress';
import { PowerFlag } from '../PowerFlag';
import chromeStyles from '../SidebarChrome.module.css';
import styles from './CollapsedRail.module.css';

export type CollapsedRailAdminMode = 'direct-edit' | 'turn-clock';

/**
 * The contents of the slim desktop rail: either the admin mode crest and status, or the power's
 * crest, unconfirmed order count, and warning dot. The `<aside>` itself stays in the parent
 * sidebar so collapsing and expanding keep one element and width transitions still play.
 */
export const CollapsedRail: React.FC<{
  activePower: Power;
  progress: OrderProgress;
  onToggleCollapse?: () => void;
  adminMode?: CollapsedRailAdminMode;
  stagedChangesCount?: number;
}> = ({
  activePower,
  progress,
  onToggleCollapse,
  adminMode,
  stagedChangesCount = 0,
}) => {
  if (adminMode) {
    const isDirectEdit = adminMode === 'direct-edit';
    const expandTitle = isDirectEdit
      ? 'Expand Edit Board'
      : 'Expand Turn and Clock Settings';
    const modeTitle = isDirectEdit ? 'Edit Board' : 'Turn and Clock Settings';

    return (
      <>
        {onToggleCollapse && (
          <button
            type="button"
            data-testid="macro-sidebar-expand-btn"
            className={cx(
              chromeStyles.sidebarRailBtn,
              chromeStyles.railToggleBtn,
            )}
            onClick={onToggleCollapse}
            title={expandTitle}
          >
            <PanelRightOpen size={16} />
          </button>
        )}

        <div className={chromeStyles.railDivider} />

        <div
          className={styles.railAdminCrest}
          data-testid="rail-admin-crest"
          title={modeTitle}
        >
          {isDirectEdit ? <Pencil size={14} /> : <Clock size={14} />}
        </div>

        {isDirectEdit && stagedChangesCount > 0 && (
          <div
            className={styles.railCounterBadge}
            title={`${stagedChangesCount} staged board change${stagedChangesCount === 1 ? '' : 's'}`}
          >
            <span
              className={styles.railBadgeStaged}
              data-testid="rail-badge-staged"
            >
              {stagedChangesCount}
            </span>
          </div>
        )}

        <div className={chromeStyles.railSpacer} />

        {onToggleCollapse && (
          <button
            type="button"
            className={cx(
              chromeStyles.sidebarRailBtn,
              chromeStyles.railExpandChevron,
            )}
            onClick={onToggleCollapse}
            title={expandTitle}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </>
    );
  }

  const powerMeta = POWER_METADATA[activePower];
  const { myActiveFieldUnits, myIssues, scCountByPower, unconfirmedCount } =
    progress;
  return (
    <>
      {onToggleCollapse && (
        <button
          type="button"
          data-testid="macro-sidebar-expand-btn"
          className={cx(
            chromeStyles.sidebarRailBtn,
            chromeStyles.railToggleBtn,
          )}
          onClick={onToggleCollapse}
          title="Expand Tactical Command & Orders"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      <div className={chromeStyles.railDivider} />

      <div
        className={styles.railPowerCrest}
        data-testid="rail-power-crest"
        title={`Commanding ${powerMeta.name} (${myActiveFieldUnits.length} Units, ${scCountByPower[activePower]} SC)`}
        style={{ borderColor: powerMeta.color }}
      >
        <PowerFlag power={activePower} width={18} height={12} />
      </div>

      <div
        className={styles.railCounterBadge}
        title={`${unconfirmedCount} unconfirmed orders`}
      >
        {unconfirmedCount > 0 ? (
          <span
            className={styles.railBadgeUnconfirmed}
            data-testid="rail-badge-unconfirmed"
          >
            {unconfirmedCount}
          </span>
        ) : (
          <span
            className={styles.railBadgeClean}
            data-testid="rail-badge-clean"
          >
            ✓
          </span>
        )}
      </div>

      {myIssues.length > 0 && (
        <div
          className={styles.railWarnBadge}
          data-testid="rail-warn-badge"
          title={`${myIssues.length} tactical issues`}
        >
          <AlertTriangle size={14} />
        </div>
      )}

      <div className={chromeStyles.railSpacer} />

      {onToggleCollapse && (
        <button
          type="button"
          className={cx(
            chromeStyles.sidebarRailBtn,
            chromeStyles.railExpandChevron,
          )}
          onClick={onToggleCollapse}
          title="Expand Tactical Orders"
        >
          <ChevronLeft size={16} />
        </button>
      )}
    </>
  );
};
