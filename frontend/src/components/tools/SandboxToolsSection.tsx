import {
  Bot,
  Eye,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { cx } from '../../utils/cx';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './SandboxToolsSection.module.css';
import buttonStyles from './ToolsButton.module.css';
import type { ToolsSidebarProps } from './toolsSidebarProps';

export type SandboxToolsSectionProps = Pick<
  ToolsSidebarProps,
  | 'sandboxMode'
  | 'onToggleSandboxMode'
  | 'onClearForeignPreMoves'
  | 'foreignModifiedOrdersCount'
  | 'onGenerateAIMoves'
  | 'onAIStepTurn'
  | 'onLoadScenario'
  | 'onSaveSandboxClick'
  | 'isMultiplayer'
>;

export const SandboxToolsSection: React.FC<SandboxToolsSectionProps> = ({
  sandboxMode,
  onToggleSandboxMode,
  onClearForeignPreMoves,
  foreignModifiedOrdersCount,
  onGenerateAIMoves,
  onAIStepTurn,
  onLoadScenario,
  onSaveSandboxClick,
  isMultiplayer = false,
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
          ? 'Hypothetical Mode active: Test moves for foreign units on the board. Exiting discards foreign guesses.'
          : 'Enter Hypothetical Mode to guess enemy moves and test what-if scenarios with the General Staff AI.'}
      </p>

      {/* AI General Staff Quick Tools */}
      {(!isMultiplayer || sandboxMode) && onGenerateAIMoves && (
        <div className={styles.toolsAiBlock}>
          <div className={styles.toolsAiHeader}>
            <Bot size={13} />
            <span>Tactical General Staff AI</span>
          </div>
          <div className={styles.toolsAiGrid}>
            <button
              type="button"
              className={cx(buttonStyles.toolsBtn, styles.toolsAiBtn)}
              onClick={() => onGenerateAIMoves(undefined, false)}
              title="Generate DATC-compliant moves for all foreign powers"
            >
              <Bot size={12} />
              <span>Plan Opponents</span>
            </button>
            <button
              type="button"
              className={cx(buttonStyles.toolsBtn, styles.toolsAiBtn)}
              onClick={() => onGenerateAIMoves(undefined, true)}
              title="Generate orders for all 7 powers"
            >
              <Sparkles size={12} />
              <span>Plan All 7</span>
            </button>
            {onAIStepTurn && !isMultiplayer && (
              <button
                type="button"
                className={cx(buttonStyles.toolsBtn, styles.toolsAiBtn)}
                data-step="true"
                onClick={onAIStepTurn}
                title="Auto-plan foreign powers and step to the next phase"
              >
                <Play size={12} />
                <span>AI Step Turn</span>
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Scenario Reset & Save */}
      {!isMultiplayer && (
        <div className={styles.toolsScenarioActions}>
          <button
            type="button"
            data-testid="btn-reset-scenario"
            className={buttonStyles.toolsBtn}
            onClick={() => onLoadScenario('standard_1901')}
            title="Reset to clean Spring 1901 start"
          >
            <RotateCcw size={12} />
            <span>Reset 1901</span>
          </button>
          {onSaveSandboxClick && (
            <button
              type="button"
              data-testid="btn-save-sandbox"
              className={buttonStyles.toolsBtn}
              onClick={onSaveSandboxClick}
              title="Save current board state to your account"
            >
              <Save size={12} />
              <span>Save Sandbox</span>
            </button>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
};
