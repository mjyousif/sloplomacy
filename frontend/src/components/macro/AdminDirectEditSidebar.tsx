import {
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  Pencil,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Order, Power, ProvinceInfo, Unit } from '../../types/diplomacy';
import type { StagedChangeEntry } from '../../utils/adminHelpers';
import { cx } from '../../utils/cx';
import type { OrderProgress } from '../../utils/orderProgress';
import type { SheetSnap } from '../../utils/sheetHelpers';
import { BottomSheet } from '../BottomSheet';
import type { DirectEditMapHandlers } from '../EuropeMap';
import macroStyles from '../MacroSidebar.module.css';
import { AdminTileInspector } from '../map/hud/AdminTileInspector';
import chromeStyles from '../SidebarChrome.module.css';
import { VersionBadge } from '../VersionBadge';
import styles from './AdminDirectEditSidebar.module.css';
import adminSidebarStyles from './AdminSidebar.module.css';
import { CollapsedRail } from './CollapsedRail';

export interface AdminDirectEditSidebarProps {
  variant: 'panel' | 'sheet';
  sheetSnap: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  provinces: Record<string, ProvinceInfo>;
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  activePower: Power;
  progress: OrderProgress;
  directEdit: DirectEditMapHandlers;
  onSelectUnit: (unitId: string | null) => void;
}

/**
 * Repurposes the right sidebar (or phone bottom sheet) into the Edit Board Territory & Unit
 * Inspector while Administrator Edit Board mode is active.
 */
export function AdminDirectEditSidebar({
  variant,
  sheetSnap,
  onSheetSnapChange,
  collapsed,
  onToggleCollapse,
  provinces,
  orders,
  ownership,
  activePower,
  progress,
  directEdit,
  onSelectUnit,
}: AdminDirectEditSidebarProps) {
  const { inspectedProvince } = directEdit;
  const diffLines = directEdit.diffLines ?? [];
  const stagedChanges: StagedChangeEntry[] =
    directEdit.stagedChanges ??
    diffLines.map((label, idx) => ({
      id: `diff:${idx}:${label}`,
      kind: 'update',
      label,
    }));
  const [stagedDrawerOpen, setStagedDrawerOpen] = useState(false);
  const committing = Boolean(directEdit.committing);

  useEffect(() => {
    if (stagedChanges.length === 0 && stagedDrawerOpen) {
      setStagedDrawerOpen(false);
    }
  }, [stagedChanges.length, stagedDrawerOpen]);
  const inspectedUnit: Unit | null = inspectedProvince
    ? (progress.unitsByProv[inspectedProvince] ?? null)
    : null;
  const inspectedProvInfo = inspectedProvince
    ? provinces[inspectedProvince]
    : undefined;
  const hasOwnershipData = Object.keys(ownership).length > 0;
  const effectiveOwner: Power | null = inspectedProvince
    ? ownership[inspectedProvince] ||
      (inspectedProvInfo?.is_supply_center && hasOwnershipData
        ? null
        : inspectedProvInfo?.home_power) ||
      null
    : null;

  const stagedActionsRow = (
    <div
      className={styles.adminSidebarActionsRow}
      data-testid="admin-sidebar-actions-row"
    >
      <span
        className={styles.adminStagedPillWrap}
        data-testid="admin-staged-pill-wrap"
      >
        <button
          type="button"
          data-expanded={stagedDrawerOpen ? 'true' : undefined}
          className={styles.adminStagedCount}
          data-testid="admin-staged-count"
          aria-expanded={stagedDrawerOpen}
          disabled={stagedChanges.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            if (stagedChanges.length === 0) return;
            const nextOpen = !stagedDrawerOpen;
            setStagedDrawerOpen(nextOpen);
            if (nextOpen && variant === 'sheet' && sheetSnap === 'peek') {
              onSheetSnapChange?.('half');
            }
          }}
        >
          <span>
            {stagedChanges.length} staged change
            {stagedChanges.length === 1 ? '' : 's'}
          </span>
          {stagedChanges.length > 0 &&
            (stagedDrawerOpen ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            ))}
        </button>
      </span>
      <button
        type="button"
        className={styles.adminApplyBtn}
        data-testid="btn-admin-apply-edits"
        onClick={(e) => {
          e.stopPropagation();
          directEdit.applyChanges?.();
        }}
        disabled={committing || stagedChanges.length === 0}
      >
        {committing ? 'Applying…' : 'Apply'}
      </button>
      <button
        type="button"
        className={styles.adminExitBtn}
        data-testid="btn-admin-clear-edits"
        title="Discard all staged (unapplied) board edits"
        onClick={(e) => {
          e.stopPropagation();
          directEdit.clearStagedChanges?.();
        }}
        disabled={committing || stagedChanges.length === 0}
      >
        Clear
      </button>
    </div>
  );

  const stagedChangesDrawer =
    stagedDrawerOpen && stagedChanges.length > 0 ? (
      <div
        className={styles.adminStagedDrawer}
        data-testid="admin-staged-drawer"
        role="region"
        aria-label="Staged changes list"
      >
        <ul className={styles.adminStagedDrawerList}>
          {stagedChanges.map((change, idx) => (
            <li
              key={change.id}
              className={styles.adminStagedDrawerItem}
              data-testid={`admin-staged-item-${idx}`}
            >
              <span className={styles.adminStagedDrawerLabel}>
                {change.label}
              </span>
              <button
                type="button"
                className={styles.adminStagedUndoBtn}
                data-testid={`btn-admin-undo-change-${idx}`}
                aria-label={`Undo ${change.label}`}
                title={`Undo: ${change.label}`}
                disabled={committing || !directEdit.onUndoStagedChange}
                onClick={(e) => {
                  e.stopPropagation();
                  directEdit.onUndoStagedChange?.(change.id);
                }}
              >
                <Undo2 size={12} />
                <span>Undo</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  // Automatically expand the sidebar or pull up the phone sheet when a territory/unit is selected on the map
  const prevInspectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (inspectedProvince && inspectedProvince !== prevInspectedRef.current) {
      if (variant === 'panel' && collapsed) {
        onToggleCollapse?.();
      } else if (variant === 'sheet' && sheetSnap === 'peek') {
        onSheetSnapChange?.('half');
      }
    }
    prevInspectedRef.current = inspectedProvince;
  }, [
    inspectedProvince,
    variant,
    collapsed,
    sheetSnap,
    onToggleCollapse,
    onSheetSnapChange,
  ]);

  const inspectorContent = inspectedProvince ? (
    <AdminTileInspector
      key={inspectedProvince}
      compact={variant === 'sheet'}
      provinceId={inspectedProvince}
      provinces={provinces}
      unit={inspectedUnit}
      order={inspectedUnit ? orders[inspectedUnit.id] : undefined}
      owner={effectiveOwner}
      activePower={activePower}
      isRelocating={Boolean(
        inspectedUnit && directEdit.relocatingUnitId === inspectedUnit.id,
      )}
      onToggleRelocate={() => {
        if (!inspectedUnit) return;
        directEdit.setRelocatingUnitId(
          directEdit.relocatingUnitId === inspectedUnit.id
            ? null
            : inspectedUnit.id,
        );
      }}
      onStageRelocateUnit={directEdit.onStageRelocateUnit}
      onStageSpawnOrUpdateUnit={directEdit.onStageSpawnOrUpdateUnit}
      onStageDestroyUnit={directEdit.onStageDestroyUnit}
      onStageOwnership={directEdit.onStageOwnership}
      onStageUnitOrder={directEdit.onStageUnitOrder}
      onClose={() => {
        directEdit.setInspectedProvince(null);
        directEdit.setRelocatingUnitId(null);
        onSelectUnit(null);
      }}
    />
  ) : (
    <div
      className={styles.adminInspectorEmptyState}
      data-testid="admin-inspector-empty"
    >
      <ShieldAlert size={22} className={styles.adminInspectorEmptyIcon} />
      <strong>No Territory or Unit Selected</strong>
      <p>
        Click any territory or piece on the map to assign ownership, spawn or
        destroy a unit, relocate a piece, or override its order.
      </p>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={(snap) => onSheetSnapChange?.(snap)}
        label="Edit Board"
        testId="macro-sidebar"
        peek={
          <div
            className={cx(macroStyles.macroSheetPeek, 'admin-sheet-peek')}
            style={{ borderLeftColor: '#b91c1c' }}
          >
            <div className={adminSidebarStyles.adminSidebarHeaderRow}>
              <div className={adminSidebarStyles.adminSidebarTitle}>
                <Pencil
                  size={15}
                  className={adminSidebarStyles.adminSidebarIcon}
                />
                <strong>
                  {inspectedProvInfo ? inspectedProvInfo.name : 'Edit Board'}
                </strong>
              </div>
            </div>
            {stagedActionsRow}
          </div>
        }
      >
        <div className={macroStyles.macroSheetBody}>
          {stagedChangesDrawer}
          <div className={macroStyles.macroUnitsScrollArea}>
            {inspectorContent}
          </div>
          <div className={chromeStyles.sidebarVersionFooter}>
            <VersionBadge />
          </div>
        </div>
      </BottomSheet>
    );
  }

  if (collapsed) {
    return (
      <aside
        className={macroStyles.macroSidebar}
        data-collapsed="true"
        aria-label="Edit Board Collapsed"
      >
        <CollapsedRail
          activePower={activePower}
          progress={progress}
          onToggleCollapse={onToggleCollapse}
          adminMode="direct-edit"
          stagedChangesCount={stagedChanges.length}
        />
      </aside>
    );
  }

  return (
    <aside
      className={cx(macroStyles.macroSidebar, 'admin-direct-edit-sidebar')}
      data-expanded="true"
      data-testid="macro-sidebar"
      aria-label="Edit Board"
    >
      <div
        className={cx(
          macroStyles.activePowerBanner,
          adminSidebarStyles.adminSidebarBanner,
        )}
        style={{ borderLeft: '4px solid #b91c1c' }}
      >
        <div className={adminSidebarStyles.adminSidebarHeaderRow}>
          <div
            className={adminSidebarStyles.adminSidebarTitle}
            data-testid="admin-sidebar-title"
          >
            <Pencil size={16} className={adminSidebarStyles.adminSidebarIcon} />
            <div>
              <h2 className={adminSidebarStyles.adminSidebarHeading}>
                Edit Board
              </h2>
              <span className={adminSidebarStyles.adminSidebarSubtitle}>
                Click any map territory or unit to edit
              </span>
            </div>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              className={chromeStyles.sidebarCollapseToggleBtn}
              onClick={onToggleCollapse}
              title="Collapse Right Sidebar"
              aria-label="Collapse Right Sidebar"
            >
              <PanelRightClose size={15} />
            </button>
          )}
        </div>
        {stagedActionsRow}
        {stagedChangesDrawer}
      </div>

      <div className={macroStyles.macroUnitsScrollArea}>{inspectorContent}</div>

      <div className={chromeStyles.sidebarVersionFooter}>
        <VersionBadge />
      </div>
    </aside>
  );
}
