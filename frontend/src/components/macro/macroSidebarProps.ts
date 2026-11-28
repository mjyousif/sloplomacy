import type React from 'react';
import type { SpectatorControls } from '../../hooks/useSpectate';
import type {
  GameParticipant,
  Order,
  Power,
  ProvinceInfo,
  SimulationResult,
  TurnRecord,
  Unit,
  UnitMoveOptions,
  ValidationIssue,
} from '../../types/diplomacy';
import type { UiSpacing, UnitMark } from '../../utils/displayPrefs';
import type { HistoryActionType } from '../../utils/historyHelpers';
import type { SheetSnap } from '../../utils/sheetHelpers';
import type { DirectEditMapHandlers } from '../EuropeMap';
import type { AdminTurnClockSettings } from './AdminTurnClockSidebar';
import type { HistoryHighlightFocus } from './HistoryTurnPanel';

export interface MacroSidebarProps {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  activePower: Power;
  finalizedPowers: Power[];
  sandboxMode: boolean;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  issues: ValidationIssue[];
  simulationResult: SimulationResult | null;
  showSimulationOverlay: boolean;
  phase?: string;
  season?: string;
  /** With the season and phase, says whether this is the first turn, which offers openings. */
  year?: number;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  unitOptions?: Record<string, UnitMoveOptions> | null;
  isMultiplayer?: boolean;
  isGameCreator?: boolean;
  gameOver?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onSelectPower?: (power: Power) => void;
  onToggleSandboxMode?: () => void;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onUpdateOrder: (order: Order) => void;
  onClearAllOrders: () => void;
  onClearForeignPreMoves?: () => void;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onSimulatePreMoves?: () => void;
  onAdjudicateTurn: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  surrenderedPowers?: Power[];
  participants?: Record<string, GameParticipant>;
  lobbyStatus?: string;
  // Collapsible Props
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * 'panel' is the desktop sidebar. 'sheet' is the phone's pull-up order sheet, which shows the
   * power, Clear All and Finalize at its peek and the unit cards when pulled up.
   */
  variant?: 'panel' | 'sheet';
  sheetSnap?: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  /** Set when inspecting a resolved past turn record; replaces live controls with the turn log. */
  historyTurn?: TurnRecord | null;
  /** Selected nation filters for the past turn log. Empty shows all nations. */
  historyPowers?: readonly Power[];
  /** Selected movement action filters for a past Movement turn. Empty shows all actions. */
  historyActions?: readonly HistoryActionType[];
  /** Unit icon display setting so the history log matches the map's pieces. */
  unitMark?: UnitMark;
  /** UI spacing preference from Display Settings ('compact' | 'normal'). */
  uiSpacing?: UiSpacing;
  onToggleUiSpacing?: () => void;
  selectedHistoryOrderId?: string | null;
  onSelectHistoryPowers?: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
  onHoverHistoryOrder?: (focus: HistoryHighlightFocus | null) => void;
  onTogglePinHistoryOrder?: (focus: HistoryHighlightFocus) => void;
  /**
   * Set while the map shows a past turn or move suggestion. For move suggestions (no
   * `historyTurn`), the live orders stay dimmed and inert under a bar back to live.
   */
  historyLabel?: string | null;
  /** True when the viewed history entry is an admin board edit. */
  historyIsAdmin?: boolean;
  onReturnToLive?: () => void;
  /** Repurposes the right sidebar into the Edit Board Inspector. */
  directEditActive?: boolean;
  directEdit?: DirectEditMapHandlers;
  /** Repurposes the right sidebar into the Turn and Clock Settings panel. */
  turnClockSettings?: AdminTurnClockSettings;
  /** Phone sheet only: opens the full-width Press sheet from the peek bar. */
  onOpenPress?: () => void;
  /** Ref for the phone Press button so closing the Press sheet restores focus to it. */
  pressToggleRef?: React.Ref<HTMLButtonElement>;
  /** Watching without a seat: the units of `activePower` are listed with nothing to order. */
  spectator?: SpectatorControls;
}
