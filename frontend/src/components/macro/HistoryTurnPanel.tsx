import { LayoutList, Rows3 } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import {
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type TurnRecord,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { UnitMark } from '../../utils/displayPrefs';
import type { HistoryActionType } from '../../utils/historyHelpers';
import {
  buildHistoryTurnLog,
  type HistoryOrderEntry,
  type HistoryPhaseKind,
  type HistoryTurnLog,
} from '../../utils/historyTurnLog';
import type { SheetSnap } from '../../utils/sheetHelpers';
import macroStyles from '../MacroSidebar.module.css';
import { getPieceFrame, MapPiece } from '../MapPiece';
import { BottomSheet } from '../ui/BottomSheet';
import { PowerFlag } from '../ui/PowerFlag';
import { HistoryOwnershipSection } from './HistoryOwnershipSection';
import {
  HistoryPeekSelection,
  resolvePinnedHistorySelection,
} from './HistoryPeekSelection';
import styles from './HistoryTurnPanel.module.css';
import { HistoryFilterSection, HistoryLockBar } from './PowerHeader';
import unitOrderListStyles from './UnitOrderList.module.css';

export interface HistoryHighlightFocus {
  id: string;
  unitId: string | null;
  provinces: string[];
}

export interface HistoryTurnPanelProps {
  variant: 'panel' | 'sheet';
  sheetSnap?: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  onToggleCollapse?: () => void;
  historyTurn: TurnRecord;
  historyLabel: string;
  historyIsAdmin?: boolean;
  historyPowers?: readonly Power[];
  historyActions?: readonly HistoryActionType[];
  unitMark?: UnitMark;
  provinces: Record<string, ProvinceInfo>;
  selectedOrderId?: string | null;
  compactOrders?: boolean;
  onToggleCompactOrders?: () => void;
  onSelectHistoryPowers?: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
  onHoverOrder?: (focus: HistoryHighlightFocus | null) => void;
  onTogglePinOrder?: (focus: HistoryHighlightFocus) => void;
}

function emptyLabel(phaseKind: HistoryPhaseKind, filtered: boolean): string {
  const subject =
    phaseKind === 'Adjustments'
      ? 'builds or disbands'
      : phaseKind === 'Retreats'
        ? 'retreats or disbands'
        : phaseKind === 'Admin'
          ? 'board edits'
          : 'orders';
  return filtered
    ? `No ${subject} match the selected filters on this turn.`
    : `No ${subject} recorded on this turn.`;
}

function ordersSectionHeading(phaseKind: HistoryPhaseKind): string {
  if (phaseKind === 'Adjustments') return 'Adjustments by Nation';
  if (phaseKind === 'Retreats') return 'Retreats by Nation';
  if (phaseKind === 'Admin') return 'Unit Edits by Nation';
  return 'Orders by Nation';
}

const CLASSIC_FRAME = getPieceFrame('classic');
// Compact mode toggle will move into Display Settings in a separate branch.
const SHOW_COMPACT_TOGGLE = false;

function compactOrderDetail(entry: HistoryOrderEntry): string | null {
  if (entry.verb === 'HOLD') return null;
  return entry.detail;
}

const HistoryOrdersContent: React.FC<{
  log: HistoryTurnLog;
  filtered: boolean;
  unitMark: UnitMark;
  selectedOrderId: string | null;
  compact: boolean;
  densityToggle: React.ReactNode;
  onSelectHistoryPowers?: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
  onHoverOrder?: (focus: HistoryHighlightFocus | null) => void;
  onTogglePinOrder?: (focus: HistoryHighlightFocus) => void;
}> = ({
  log,
  filtered,
  unitMark,
  selectedOrderId,
  compact,
  densityToggle,
  onSelectHistoryPowers,
  onSelectHistoryActions,
  onHoverOrder,
  onTogglePinOrder,
}) => {
  if (log.totalCount === 0) {
    return (
      <div className={styles.historyEmptyState} data-testid="history-empty">
        <span>{emptyLabel(log.phaseKind, filtered)}</span>
        {filtered && (onSelectHistoryPowers || onSelectHistoryActions) && (
          <button
            type="button"
            className={styles.historyFilterClear}
            data-testid="history-empty-clear-filter"
            onClick={() => {
              onSelectHistoryPowers?.([]);
              onSelectHistoryActions?.([]);
            }}
          >
            Show all
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <HistoryOwnershipSection
        ownershipChanges={log.ownershipChanges}
        phaseKind={log.phaseKind}
        selectedOrderId={selectedOrderId}
        compact={compact}
        densityToggle={densityToggle}
        onHoverOrder={onHoverOrder}
        onTogglePinOrder={onTogglePinOrder}
      />

      {log.groups.length > 0 && (
        <div
          className={cx(
            styles.historySection,
            log.ownershipChanges.length > 0 && styles.historySectionDivided,
          )}
          data-testid="history-orders-section"
        >
          <div className={styles.historySectionHeaderRow}>
            <div className={styles.historySectionHeader}>
              {ordersSectionHeading(log.phaseKind)}
            </div>
            {log.ownershipChanges.length === 0 ? densityToggle : null}
          </div>
          {log.groups.map((group) => {
            const meta = POWER_METADATA[group.power];
            return (
              <section
                key={group.power}
                className={styles.historyPowerGroup}
                data-testid="history-power-group"
                data-power={group.power}
                data-compact={compact ? 'true' : undefined}
                style={{ '--group-color': meta.color } as React.CSSProperties}
              >
                <header className={styles.historyPowerHeader}>
                  <div className={styles.historyPowerTitle}>
                    <PowerFlag power={group.power} width={18} height={12} />
                    <span>{meta.shortName}</span>
                  </div>
                </header>
                <div className={styles.historyEntries}>
                  {group.entries.map((entry) => {
                    const focus: HistoryHighlightFocus = {
                      id: entry.id,
                      unitId: entry.highlightUnitId,
                      provinces: entry.highlightProvinces,
                    };
                    const isSelected = selectedOrderId === entry.id;
                    const compactDetail = compactOrderDetail(entry);
                    const unitIconSize = compact ? 16 : 20;
                    const unitIcon = entry.unitType ? (
                      <svg
                        className={styles.historyUnitMarkIcon}
                        width={unitIconSize}
                        height={unitIconSize}
                        viewBox="-21 -21 42 42"
                        aria-hidden="true"
                        data-testid="history-order-unit-icon"
                        data-unit-type={entry.unitType}
                        data-unit-mark={unitMark}
                      >
                        <MapPiece
                          style="classic"
                          mark={unitMark}
                          unitType={entry.unitType}
                          color={meta.color}
                          frame={CLASSIC_FRAME}
                        />
                      </svg>
                    ) : null;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={styles.historyEntryRow}
                        data-testid="history-order-item"
                        data-order-id={entry.id}
                        data-selected={isSelected ? 'true' : undefined}
                        data-compact={compact ? 'true' : undefined}
                        aria-pressed={isSelected}
                        title={
                          compact
                            ? `${entry.locationLabel}: ${entry.detail}${entry.reason ? ` — ${entry.reason}` : ''}`
                            : undefined
                        }
                        onPointerEnter={(e) => {
                          if (e.pointerType !== 'touch') onHoverOrder?.(focus);
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType !== 'touch') onHoverOrder?.(null);
                        }}
                        onClick={() => onTogglePinOrder?.(focus)}
                      >
                        {compact ? (
                          <div className={styles.historyCompactRow}>
                            <span className={styles.historyCompactLead}>
                              {unitIcon}
                              <span className={styles.historyCompactLoc}>
                                {entry.locationLabel}
                              </span>
                              {compactDetail && (
                                <span className={styles.historyCompactDetail}>
                                  {compactDetail}
                                </span>
                              )}
                            </span>
                            <span
                              className={styles.historyOutcomePill}
                              data-tone={entry.outcomeTone}
                            >
                              {entry.outcomeLabel}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className={styles.historyEntryTop}>
                              <span className={styles.historyEntryUnit}>
                                {unitIcon}
                                <span>{entry.locationLabel}</span>
                              </span>
                              <span
                                className={styles.historyOutcomePill}
                                data-tone={entry.outcomeTone}
                              >
                                {entry.outcomeLabel}
                              </span>
                            </div>
                            <div className={styles.historyEntryDetail}>
                              {entry.detail}
                            </div>
                            {entry.reason && (
                              <div className={styles.historyEntryReason}>
                                {entry.reason}
                              </div>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {log.adminNotes.length > 0 && (
        <section
          className={styles.historyPowerGroup}
          data-testid="history-admin-notes"
          style={{ '--group-color': '#dc2626' } as React.CSSProperties}
        >
          <header className={styles.historyPowerHeader}>
            <div className={styles.historyPowerTitle}>
              <span>Admin Notes</span>
            </div>
          </header>
          <div className={styles.historyEntries}>
            {log.adminNotes.map((note) => (
              <div key={note} className={styles.historyEntryRow}>
                <div className={styles.historyEntryDetail}>{note}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
};

/**
 * Right-sidebar view when inspecting a resolved past turn: displays a single unified top bar
 * over the list of movements, retreats, winter adjustments, or admin board edits filtered to any
 * selected nations, with hover and click map highlighting.
 */
export const HistoryTurnPanel: React.FC<HistoryTurnPanelProps> = ({
  variant,
  sheetSnap = 'peek',
  onSheetSnapChange,
  onToggleCollapse,
  historyTurn,
  historyLabel,
  historyIsAdmin = false,
  historyPowers = [],
  historyActions = [],
  unitMark = 'icons',
  provinces,
  selectedOrderId = null,
  compactOrders = false,
  onToggleCompactOrders,
  onSelectHistoryPowers,
  onSelectHistoryActions,
  onHoverOrder,
  onTogglePinOrder,
}) => {
  const isSheet = variant === 'sheet';
  const compact = !isSheet && compactOrders;
  const log = useMemo(
    () =>
      buildHistoryTurnLog(
        historyTurn,
        provinces,
        historyPowers,
        historyActions,
      ),
    [historyTurn, provinces, historyPowers, historyActions],
  );
  const filtered =
    historyPowers.length > 0 ||
    ((log.phaseKind === 'Movement' || log.phaseKind === 'Adjustments') &&
      historyActions.length > 0);
  const densityToggle =
    SHOW_COMPACT_TOGGLE && !isSheet && onToggleCompactOrders ? (
      <button
        type="button"
        data-testid="btn-toggle-compact-orders"
        className={unitOrderListStyles.macroDensityToggle}
        aria-pressed={compactOrders}
        onClick={onToggleCompactOrders}
        title={
          compactOrders
            ? 'Switch to detailed past-turn entries'
            : 'Switch to compact one-line entries'
        }
      >
        {compactOrders ? <Rows3 size={12} /> : <LayoutList size={12} />}
        <span>{compactOrders ? 'Detailed' : 'Compact'}</span>
      </button>
    ) : null;

  if (isSheet) {
    const {
      selectedOrder,
      selectedOwnership,
      clearFocus: clearSelectedFocus,
    } = resolvePinnedHistorySelection(log, selectedOrderId);
    const handleSheetTogglePin = (focus: HistoryHighlightFocus) => {
      const pinningNew = selectedOrderId !== focus.id;
      onTogglePinOrder?.(focus);
      if (pinningNew) onSheetSnapChange?.('peek');
    };

    return (
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={(snap) => onSheetSnapChange?.(snap)}
        label="Turn Log"
        testId="macro-sidebar"
        peek={
          <div
            className={macroStyles.macroSheetPeek}
            data-testid="macro-sheet-peek"
            data-history-view="true"
          >
            <HistoryLockBar
              historyLabel={historyLabel}
              historyIsAdmin={historyIsAdmin}
            />
            <HistoryPeekSelection
              selectedOrder={selectedOrder}
              selectedOwnership={selectedOwnership}
              onExpand={() => onSheetSnapChange?.('half')}
              onClear={() => {
                if (clearSelectedFocus) onTogglePinOrder?.(clearSelectedFocus);
              }}
            />
          </div>
        }
      >
        <div
          className={styles.historySheetBodyList}
          data-testid="history-orders-list"
        >
          <HistoryFilterSection
            historyPhase={historyTurn.phase}
            historySeason={historyTurn.season}
            historyIsAdmin={historyIsAdmin}
            historyPowers={historyPowers}
            historyActions={historyActions}
            onSelectHistoryPowers={(next) => onSelectHistoryPowers?.(next)}
            onSelectHistoryActions={(next) => onSelectHistoryActions?.(next)}
          />
          <HistoryOrdersContent
            log={log}
            filtered={filtered}
            unitMark={unitMark}
            selectedOrderId={selectedOrderId}
            compact={false}
            densityToggle={null}
            onSelectHistoryPowers={onSelectHistoryPowers}
            onSelectHistoryActions={onSelectHistoryActions}
            onHoverOrder={onHoverOrder}
            onTogglePinOrder={handleSheetTogglePin}
          />
        </div>
      </BottomSheet>
    );
  }

  return (
    <aside
      className={macroStyles.macroSidebar}
      data-expanded="true"
      data-testid="macro-sidebar"
      data-history-view="true"
      aria-label="Past Turn Log"
    >
      <div
        className={styles.historyScrollPanel}
        data-testid="history-panel-scroll"
      >
        <HistoryLockBar
          historyLabel={historyLabel}
          historyPhase={historyTurn.phase}
          historySeason={historyTurn.season}
          historyIsAdmin={historyIsAdmin}
          historyPowers={historyPowers}
          historyActions={historyActions}
          onSelectHistoryPowers={(next) => onSelectHistoryPowers?.(next)}
          onSelectHistoryActions={(next) => onSelectHistoryActions?.(next)}
          onToggleCollapse={onToggleCollapse}
        />

        <div
          className={styles.historyOrdersBody}
          data-testid="history-orders-list"
        >
          <HistoryOrdersContent
            log={log}
            filtered={filtered}
            unitMark={unitMark}
            selectedOrderId={selectedOrderId}
            compact={compact}
            densityToggle={densityToggle}
            onSelectHistoryPowers={onSelectHistoryPowers}
            onSelectHistoryActions={onSelectHistoryActions}
            onHoverOrder={onHoverOrder}
            onTogglePinOrder={onTogglePinOrder}
          />
        </div>
      </div>
    </aside>
  );
};
