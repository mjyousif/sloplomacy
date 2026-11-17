import { Eye, Trash2 } from 'lucide-react';
import type React from 'react';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import styles from './SandboxToolsSection.module.css';
import type { ToolsSidebarProps } from './toolsSidebarProps';

export type SandboxToolsSectionProps = Pick<
  ToolsSidebarProps,
  | 'sandboxMode'
  | 'onToggleSandboxMode'
  | 'onClearForeignPreMoves'
  | 'foreignModifiedOrdersCount'
>;

export const SandboxToolsSection: React.FC<SandboxToolsSectionProps> = ({
  sandboxMode,
  onToggleSandboxMode,
  onClearForeignPreMoves,
  foreignModifiedOrdersCount,
}) => {
  return (
    <CollapsibleSection
      title="HYPOTHETICAL MODE & PRE-MOVES"
      badge={
        sandboxMode ? (
          <span
            className={styles.sandboxLivePill}
            data-testid="sandbox-live-pill"
          >
            ACTIVE
          </span>
        ) : undefined
      }
      collapsible={true}
      defaultOpen={true}
    >
      <button
        type="button"
        data-testid="btn-toggle-sandbox"
        data-active={sandboxMode ? 'true' : undefined}
        className={styles.toolsSandboxToggleBtn}
        onClick={onToggleSandboxMode}
      >
        <Eye size={14} />
        <span>
          {sandboxMode
            ? 'Exit Mode (Discard Guesses)'
            : 'Enter Hypothetical Mode'}
        </span>
      </button>

      <p className={styles.toolsMicroDesc}>
        {sandboxMode
          ? 'Hypothetical Mode active: Plot moves for any nation and step forward on this temporary branch. Exiting restores the real game.'
          : 'Enter Hypothetical Mode to test foreign moves and step turns forward on a temporary branch without affecting the real match.'}
      </p>

      {/* Foreign Pre-Moves Count / Clear */}
      {sandboxMode && foreignModifiedOrdersCount > 0 && (
        <div className={styles.toolsForeignSummary}>
          <span>{foreignModifiedOrdersCount} foreign moves plotted</span>
          <button
            type="button"
            className={styles.toolsBtnMini}
            onClick={onClearForeignPreMoves}
            title="Discard all foreign pre-moves"
          >
            <Trash2 size={11} /> Clear
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
};
