import type React from 'react';
import type {
  GameParticipant,
  Power,
  Unit,
  ValidationIssue,
} from '../../types/diplomacy';
import type { PressSectionProps } from './PressSection';

export interface ToolsSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Zoom & Camera
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  // Powers & Sovereignty
  activePower: Power;
  onSelectPower: (power: Power) => void;
  ownership: Record<string, Power>;
  units: Unit[];
  finalizedPowers: Power[];
  surrenderedPowers?: Power[];
  issues: ValidationIssue[];
  isMultiplayer?: boolean;
  participants?: Record<string, GameParticipant>;
  // Sandbox & AI
  sandboxMode: boolean;
  onToggleSandboxMode: () => void;
  onClearForeignPreMoves: () => void;
  foreignModifiedOrdersCount: number;
  onGenerateAIMoves?: (powers?: Power[], includeActive?: boolean) => void;
  onAIStepTurn?: () => void;
  onLoadScenario: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  adminOverrideActive?: boolean;
  /**
   * 'panel' is the desktop sidebar with its rail. 'drawer' is the phone's slide-over, opened from
   * the top bar's ≡ button: always expanded, with a backdrop, and without the zoom section,
   * because a phone's zoom buttons sit on the map.
   */
  variant?: 'panel' | 'drawer';
  /** Drawer only: whether it is showing. */
  open?: boolean;
  /** Drawer only: closes it (backdrop tap, Escape or the close button). */
  onClose?: () => void;
  /**
   * Standings only: the seat the player may send private press from. Each other country's row
   * then gets a letter button that picks it as a recipient.
   */
  pressPower?: Power;
  /** Press (chat) for a seated player of a multiplayer match. Left out, there is no section. */
  press?: Omit<PressSectionProps, 'visible'>;
  /** The turn selector, pinned below the scrolling sections (not shown on the collapsed rail). */
  historyFooter?: React.ReactNode;
}
