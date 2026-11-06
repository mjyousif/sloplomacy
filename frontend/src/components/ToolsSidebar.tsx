import React from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  Power,
  Unit,
  ValidationIssue,
} from '../types/diplomacy';
import {
  AlertTriangle,
  Anchor,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Flag,
  HelpCircle,
  Maximize2,
  MoveRight,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

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
  // Sandbox & AI
  sandboxMode: boolean;
  onToggleSandboxMode: () => void;
  onClearForeignPreMoves: () => void;
  foreignModifiedOrdersCount: number;
  onGenerateAIMoves?: (powers?: Power[], includeActive?: boolean) => void;
  onAIStepTurn?: () => void;
  onLoadScenario: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  // Admin
  isGameCreator?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
}

export const ToolsSidebar: React.FC<ToolsSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  activePower,
  onSelectPower,
  ownership,
  units,
  finalizedPowers,
  surrenderedPowers = [],
  issues,
  isMultiplayer = false,
  sandboxMode,
  onToggleSandboxMode,
  onClearForeignPreMoves,
  foreignModifiedOrdersCount,
  onGenerateAIMoves,
  onAIStepTurn,
  onLoadScenario,
  onSaveSandboxClick,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
}) => {
  // Compute Supply Centers per power
  const scCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const [, pwr] of Object.entries(ownership)) {
    if (scCountByPower[pwr] !== undefined) scCountByPower[pwr]++;
  }

  // Compute unit counts per power
  const unitCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const u of units) {
    if (!u.is_dislodged && unitCountByPower[u.power] !== undefined) {
      unitCountByPower[u.power]++;
    }
  }

  // Collapsed Minimalist Rail
  if (collapsed) {
    return (
      <aside className="tools-sidebar tools-sidebar-collapsed" aria-label="Tools Sidebar Collapsed">
        <button
          type="button"
          className="sidebar-rail-btn rail-toggle-btn"
          onClick={onToggleCollapse}
          title="Expand Chancellery Tools & Intel"
        >
          <PanelLeftOpen size={16} />
        </button>

        <div className="rail-divider" />

        <div className="rail-group" title={`Current Zoom: ${zoomPercent}%`}>
          <button
            type="button"
            className="sidebar-rail-btn"
            onClick={onZoomIn}
            title="Zoom In (+)"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="sidebar-rail-btn"
            onClick={onZoomOut}
            title="Zoom Out (-)"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            className="sidebar-rail-btn"
            onClick={onResetCamera}
            title="Fit Map / Reset Camera"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="rail-divider" />

        <button
          type="button"
          className={`sidebar-rail-btn ${sandboxMode ? 'rail-active-glow' : ''}`}
          onClick={onToggleSandboxMode}
          title={sandboxMode ? 'Hypothetical Mode ACTIVE (Click to toggle)' : 'Enter Hypothetical Mode'}
        >
          <Eye size={16} />
        </button>

        {isGameCreator && onOpenAdminTools && (
          <button
            type="button"
            className={`sidebar-rail-btn ${adminOverrideActive ? 'rail-admin-glow' : ''}`}
            onClick={onOpenAdminTools}
            title="Creator Admin Console"
          >
            <ShieldAlert size={16} />
          </button>
        )}

        <div className="rail-spacer" />

        <button
          type="button"
          className="sidebar-rail-btn rail-expand-chevron"
          onClick={onToggleCollapse}
          title="Expand Tools"
        >
          <ChevronRight size={16} />
        </button>
      </aside>
    );
  }

  // Expanded Tools Sidebar
  return (
    <aside className="tools-sidebar tools-sidebar-expanded" aria-label="Chancellery Tools & Intel">
      {/* 1. SIDEBAR HEADER */}
      <div className="tools-sidebar-header">
        <div className="tools-header-title">
          <Sliders size={16} className="tools-header-icon" />
          <div>
            <h3>CHANCELLERY TOOLS</h3>
            <span className="tools-header-sub">Intel, Camera &amp; War Room</span>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-collapse-toggle-btn"
          onClick={onToggleCollapse}
          title="Collapse Tools Sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="tools-sidebar-content">
        {/* 2. CAMERA & MAP CONTROLS */}
        <section className="tools-section">
          <div className="tools-section-overline">
            <span>MAP VIEW &amp; CAMERA</span>
            <span className="tools-zoom-badge">{zoomPercent}%</span>
          </div>
          <div className="tools-zoom-toolbar">
            <button
              type="button"
              className="tools-btn"
              onClick={onZoomOut}
              title="Zoom Out"
            >
              <ZoomOut size={13} />
              <span>Out</span>
            </button>
            <button
              type="button"
              className="tools-btn"
              onClick={onZoomIn}
              title="Zoom In"
            >
              <ZoomIn size={13} />
              <span>In</span>
            </button>
            <button
              type="button"
              className="tools-btn"
              onClick={onResetCamera}
              title="Reset Map to 105% Default View"
            >
              <Maximize2 size={13} />
              <span>Fit Map</span>
            </button>
          </div>
        </section>

        {/* 3. CARTOGRAPHIC TACTICAL LEGEND */}
        <section className="tools-section">
          <div className="tools-section-overline">
            <span>TACTICAL MAP LEGEND</span>
          </div>
          <div className="tools-legend-grid">
            <div className="legend-item" title="Army or Fleet movement arrow">
              <span className="legend-swatch swatch-move">
                <MoveRight size={12} />
              </span>
              <span className="legend-label">Move / Attack Vector</span>
            </div>
            <div className="legend-item" title="Support order to hold or move">
              <span className="legend-swatch swatch-support">
                <Crosshair size={12} />
              </span>
              <span className="legend-label">Support Link</span>
            </div>
            <div className="legend-item" title="Fleet convoying an army across sea">
              <span className="legend-swatch swatch-convoy">
                <Anchor size={12} />
              </span>
              <span className="legend-label">Fleet Convoy</span>
            </div>
            <div className="legend-item" title="Tactical issue or dislodgement">
              <span className="legend-swatch swatch-warn">
                <AlertTriangle size={12} />
              </span>
              <span className="legend-label">Warning / Dislodgement</span>
            </div>
          </div>
        </section>

        {/* 4. GREAT POWERS STANDING & SELECTION */}
        <section className="tools-section">
          <div className="tools-section-overline">
            <span>{isMultiplayer ? 'DIPLOMATIC STANDING' : 'COMMAND NATION (SELECT)'}</span>
            <span className="tools-section-count">7 Powers</span>
          </div>
          <div className="powers-standing-list">
            {ALL_POWERS.map((pwr) => {
              const meta = POWER_METADATA[pwr];
              const isSelected = pwr === activePower;
              const isFinal = finalizedPowers.includes(pwr);
              const isSurr = surrenderedPowers.includes(pwr);
              const pwrIssues = issues.filter((i) => i.power === pwr);
              const scs = scCountByPower[pwr] || 0;
              const un = unitCountByPower[pwr] || 0;

              return (
                <div
                  key={pwr}
                  className={`power-standing-card ${isSelected ? 'selected' : ''} ${!isMultiplayer ? 'clickable' : ''}`}
                  onClick={() => {
                    if (!isMultiplayer) onSelectPower(pwr);
                  }}
                  title={
                    !isMultiplayer
                      ? `Click to command ${meta.name}`
                      : `${meta.name}: ${isFinal ? 'Orders Finalized' : 'Drafting'}`
                  }
                  style={{
                    borderLeftColor: meta.color,
                    background: isSelected ? meta.lightBg : undefined,
                  }}
                >
                  <div className="power-card-left">
                    <span className="power-card-crest">{meta.crest}</span>
                    <div className="power-card-info">
                      <div className="power-card-name">
                        <span className="power-dot" style={{ backgroundColor: meta.color }} />
                        <strong>{meta.shortName}</strong>
                        {isSelected && <span className="active-tag">Active</span>}
                      </div>
                      <div className="power-card-metrics">
                        <span>{scs} SC</span>
                        <span className="metric-dot">•</span>
                        <span>{un} Units</span>
                      </div>
                    </div>
                  </div>

                  <div className="power-card-status">
                    {isSurr ? (
                      <span className="mini-status-tag surrendered" title="Civil Disorder">
                        <Flag size={10} /> CD
                      </span>
                    ) : isFinal ? (
                      <span className="mini-status-tag finalized" title="Finalized">
                        <CheckCircle2 size={11} />
                      </span>
                    ) : pwrIssues.length > 0 ? (
                      <span className="mini-status-tag warning" title={`${pwrIssues.length} issues`}>
                        {pwrIssues.length}⚠
                      </span>
                    ) : (
                      <span className="mini-status-tag pending" title="Drafting Orders">
                        Draft
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. HYPOTHETICAL MODE & TACTICAL AI GENERAL STAFF */}
        <section className="tools-section">
          <div className="tools-section-overline">
            <span>HYPOTHETICAL MODE &amp; PRE-MOVES</span>
            {sandboxMode && <span className="sandbox-live-pill">ACTIVE</span>}
          </div>

          <button
            type="button"
            className={`tools-sandbox-toggle-btn ${sandboxMode ? 'active' : ''}`}
            onClick={onToggleSandboxMode}
          >
            <Eye size={14} />
            <span>
              {sandboxMode ? 'Exit Mode (Discard Guesses)' : 'Enter Hypothetical Mode'}
            </span>
          </button>

          <p className="tools-micro-desc">
            {sandboxMode
              ? 'Hypothetical Mode active: Test moves for foreign units on the board. Exiting discards foreign guesses.'
              : 'Enter Hypothetical Mode to guess enemy moves and test what-if scenarios with the General Staff AI.'}
          </p>

          {/* AI General Staff Quick Tools */}
          {(!isMultiplayer || sandboxMode) && onGenerateAIMoves && (
            <div className="tools-ai-block">
              <div className="tools-ai-header">
                <Bot size={13} />
                <span>Tactical General Staff AI</span>
              </div>
              <div className="tools-ai-grid">
                <button
                  type="button"
                  className="tools-btn tools-ai-btn"
                  onClick={() => onGenerateAIMoves(undefined, false)}
                  title="Generate DATC-compliant moves for all foreign powers"
                >
                  <Bot size={12} />
                  <span>Plan Opponents</span>
                </button>
                <button
                  type="button"
                  className="tools-btn tools-ai-btn"
                  onClick={() => onGenerateAIMoves(undefined, true)}
                  title="Generate orders for all 7 powers"
                >
                  <Sparkles size={12} />
                  <span>Plan All 7</span>
                </button>
                {onAIStepTurn && !isMultiplayer && (
                  <button
                    type="button"
                    className="tools-btn tools-ai-btn ai-step"
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
            <div className="tools-foreign-summary">
              <span>{foreignModifiedOrdersCount} foreign moves plotted</span>
              <button
                type="button"
                className="tools-btn-mini"
                onClick={onClearForeignPreMoves}
                title="Discard all foreign pre-moves"
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>
          )}

          {/* Scenario Reset & Save */}
          {!isMultiplayer && (
            <div className="tools-scenario-actions">
              <button
                type="button"
                className="tools-btn"
                onClick={() => onLoadScenario('standard_1901')}
                title="Reset to clean Spring 1901 start"
              >
                <RotateCcw size={12} />
                <span>Reset 1901</span>
              </button>
              {onSaveSandboxClick && (
                <button
                  type="button"
                  className="tools-btn"
                  onClick={onSaveSandboxClick}
                  title="Save current board state to your account"
                >
                  <Save size={12} />
                  <span>Save Sandbox</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* 6. CREATOR ADMINISTRATOR CONTROLS */}
        {isGameCreator && onOpenAdminTools && (
          <section className="tools-section admin-tools-section">
            <div className="tools-section-overline">
              <span className="creator-overline">
                <ShieldAlert size={12} /> CREATOR ADMIN TOOLS
              </span>
            </div>
            <p className="tools-micro-desc">
              Roll back turns, teleport units, spawn or destroy forces arbitrarily.
            </p>
            <div className="admin-actions-column">
              <button
                type="button"
                className="tools-btn tools-admin-console-btn"
                onClick={onOpenAdminTools}
                title="Open comprehensive administrator modal"
              >
                <Sliders size={13} />
                <span>Open Admin Console</span>
              </button>
              {onToggleAdminOverride && (
                <button
                  type="button"
                  className={`tools-btn admin-override-toggle-btn ${adminOverrideActive ? 'active' : ''}`}
                  onClick={onToggleAdminOverride}
                  title="Toggle Direct-Edit Override on the board"
                >
                  <Shield size={13} />
                  <span>{adminOverrideActive ? 'Direct-Edit: ON' : 'Direct-Edit: OFF'}</span>
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
