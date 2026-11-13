import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Order, Power, ProvinceInfo, Unit } from '../types/diplomacy';
import { MacroSidebar, type MacroSidebarProps } from './MacroSidebar';
import { ToolsSidebar, type ToolsSidebarProps } from './ToolsSidebar';

const mockProvinces: Record<string, ProvinceInfo> = {
  PAR: {
    id: 'PAR',
    name: 'Paris',
    type: 'LAND',
    is_supply_center: true,
    home_power: 'FRANCE',
    coasts: [],
    army_adj: ['BRE', 'BUR'],
    fleet_adj: {},
  },
  BRE: {
    id: 'BRE',
    name: 'Brest',
    type: 'COAST',
    is_supply_center: true,
    home_power: 'FRANCE',
    coasts: [],
    army_adj: ['PAR'],
    fleet_adj: { '': ['ENG'] },
  },
};

const mockUnits: Unit[] = [
  {
    id: 'A_PAR',
    power: 'FRANCE',
    unit_type: 'A',
    province: 'PAR',
    coast: null,
    is_dislodged: false,
  },
  {
    id: 'F_BRE',
    power: 'FRANCE',
    unit_type: 'F',
    province: 'BRE',
    coast: null,
    is_dislodged: false,
  },
];

const mockOrders: Record<string, Order> = {
  A_PAR: {
    unit_id: 'A_PAR',
    power: 'FRANCE',
    unit_type: 'A',
    origin: 'PAR',
    origin_coast: null,
    order_type: 'HOLD',
    target: null,
    target_coast: null,
    aux_unit_origin: null,
    via_convoy: false,
    is_explicit: true,
  },
  F_BRE: {
    unit_id: 'F_BRE',
    power: 'FRANCE',
    unit_type: 'F',
    origin: 'BRE',
    origin_coast: null,
    order_type: 'HOLD',
    target: null,
    target_coast: null,
    aux_unit_origin: null,
    via_convoy: false,
    is_explicit: false,
  },
};

const mockOwnership: Record<string, Power> = {
  PAR: 'FRANCE',
  BRE: 'FRANCE',
  LON: 'ENGLAND',
  BER: 'GERMANY',
};

describe('ToolsSidebar', () => {
  const baseToolsProps: ToolsSidebarProps = {
    collapsed: false,
    onToggleCollapse: vi.fn(),
    zoomPercent: 105,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetCamera: vi.fn(),
    activePower: 'FRANCE',
    onSelectPower: vi.fn(),
    ownership: mockOwnership,
    units: mockUnits,
    finalizedPowers: ['FRANCE'],
    surrenderedPowers: [],
    issues: [],
    isMultiplayer: false,
    sandboxMode: false,
    onToggleSandboxMode: vi.fn(),
    onClearForeignPreMoves: vi.fn(),
    foreignModifiedOrdersCount: 0,
    onLoadScenario: vi.fn(),
  };

  it('renders collapsed rail view when collapsed is true', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, { ...baseToolsProps, collapsed: true }),
    );
    expect(html).toContain('aria-label="Tools Sidebar Collapsed"');
    expect(html).toContain('tools-sidebar-collapsed');
    expect(html).toContain('Zoom In');
    expect(html).toContain('Zoom Out');
    expect(html).not.toContain('CHANCELLERY TOOLS');
  });

  it('renders expanded tools layout with legend, zoom, powers and sandbox', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, baseToolsProps),
    );
    expect(html).toContain('CHANCELLERY TOOLS');
    expect(html).toContain('MAP VIEW &amp; CAMERA');
    expect(html).toContain('105%');
    expect(html).toContain('TACTICAL MAP LEGEND');
    expect(html).toContain('Move / Attack');
    expect(html).not.toContain('Move / Attack Vector');
    expect(html).toContain('Support Link');
    expect(html).toContain('Fleet Convoy');
    expect(html).toContain('Warning');
    expect(html).not.toContain('Warning / Dislodgement');
    expect(html).toContain('COMMAND NATION (SELECT)');
    expect(html).toContain('France');
    expect(html).toContain('England');
    expect(html).toContain('Germany');
    expect(html).toContain('HYPOTHETICAL MODE &amp; PRE-MOVES');
    expect(html).toContain('Enter Hypothetical Mode');
    expect(html).not.toContain('CREATOR ADMIN TOOLS');
  });

  it('pairs the legend entries so convoy sits beside move and warning beside support', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, baseToolsProps),
    );
    const order = [
      'Move / Attack',
      'Fleet Convoy',
      'Support Link',
      'Warning',
    ].map((label) => html.indexOf(label));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('renders sandbox as collapsible section with toggle buttons (admin tools moved to display settings)', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, {
        ...baseToolsProps,
        sandboxMode: true,
      }),
    );
    // Sandbox collapsible section
    expect(html).toContain('HYPOTHETICAL MODE &amp; PRE-MOVES');
    expect(html).toContain('sandbox-live-pill');
    expect(html).toContain('ACTIVE');
    // Admin collapsible section is no longer in ToolsSidebar
    expect(html).not.toContain('CREATOR ADMIN TOOLS');

    const buttons = html.match(/sidebar-section-toggle-btn/g);
    // Legend, Powers, Sandbox -> 3 collapsible sections
    expect(buttons?.length).toBe(3);
  });

  it('renders SVG flags and rank badges in diplomatic standings', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, baseToolsProps),
    );
    expect(html).toContain('data-testid="power-rank"');
    expect(html).toContain('data-testid="power-flag-france"');
    expect(html).toContain('data-testid="power-flag-england"');
    expect(html).toContain('data-testid="power-flag-russia"');
    expect(html).toContain('data-testid="standings-sort-score"');
    expect(html).toContain('data-testid="standings-sort-default"');
    expect(html).toContain('By Score');
    expect(html).toContain('Default');
  });

  it('places active tag inside power-card-metrics to prevent status overflow', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, {
        ...baseToolsProps,
        activePower: 'FRANCE',
      }),
    );
    expect(html).toContain('data-testid="power-card-metrics"');
    expect(html).toContain('data-testid="active-tag"');
    expect(html).toMatch(
      /data-testid="power-card-metrics"[^>]*>.*?data-testid="active-tag"/,
    );
  });

  it('renders player names in diplomatic standings when participants are provided (issue 122)', () => {
    const html = renderToString(
      React.createElement(ToolsSidebar, {
        ...baseToolsProps,
        isMultiplayer: true,
        participants: {
          FRANCE: {
            user_id: 'u1',
            email: 'napoleon@example.com',
            display_name: 'Napoleon',
            power: 'FRANCE',
            joined_at: '2026-11-06T00:00:00Z',
          },
          ENGLAND: {
            user_id: 'u2',
            email: 'nelson@example.com',
            display_name: 'AdmiralNelson',
            power: 'ENGLAND',
            joined_at: '2026-11-06T00:00:00Z',
          },
        },
      }),
    );
    expect(html).toContain('Napoleon');
    expect(html).toContain('AdmiralNelson');
    expect(html).toContain('Open'); // Unclaimed seat
  });

  describe('as the phone drawer', () => {
    const drawer = (props: Partial<ToolsSidebarProps>) =>
      renderToString(
        React.createElement(ToolsSidebar, {
          ...baseToolsProps,
          variant: 'drawer',
          onClose: vi.fn(),
          ...props,
        }),
      );

    it('shows the full tools, even when the desktop rail was collapsed, but no zoom section', () => {
      const html = drawer({ open: true, collapsed: true });
      expect(html).toContain('data-testid="tools-drawer"');
      expect(html).toContain('TACTICAL MAP LEGEND');
      expect(html).toContain('Enter Hypothetical Mode');
      expect(html).not.toContain('data-testid="tools-sidebar-collapsed"');
      // The zoom buttons are on the map on a phone.
      expect(html).not.toContain('MAP VIEW &amp; CAMERA');
      expect(html).not.toContain('data-testid="tools-zoom-toolbar"');
    });

    it('closes with its own button instead of collapsing to a rail', () => {
      const html = drawer({ open: true });
      expect(html).toContain('aria-label="Close tools"');
      expect(html).not.toContain('tools-sidebar-collapse-btn');
      expect(html).toContain('data-testid="tools-drawer-backdrop"');
    });

    it('stays mounted but inert while shut, so it can slide both ways', () => {
      expect(drawer({ open: false })).toMatch(
        /data-testid="tools-drawer-layer"[^>]*inert/,
      );
      expect(drawer({ open: true })).not.toMatch(
        /data-testid="tools-drawer-layer"[^>]*inert/,
      );
    });

    it('leaves the desktop panel as it was', () => {
      const html = renderToString(
        React.createElement(ToolsSidebar, baseToolsProps),
      );
      expect(html).not.toContain('data-testid="tools-drawer"');
      expect(html).toContain('MAP VIEW &amp; CAMERA');
    });
  });
});

describe('MacroSidebar', () => {
  const baseMacroProps: MacroSidebarProps = {
    provinces: mockProvinces,
    units: mockUnits,
    orders: mockOrders,
    ownership: mockOwnership,
    activePower: 'FRANCE',
    finalizedPowers: [],
    sandboxMode: false,
    selectedUnitId: null,
    hoveredUnitId: null,
    issues: [],
    simulationResult: null,
    showSimulationOverlay: false,
    phase: 'Movement',
    season: 'Spring',
    isMultiplayer: false,
    isGameCreator: false,
    gameOver: false,
    onSelectUnit: vi.fn(),
    onHoverUnit: vi.fn(),
    onHighlightProvinces: vi.fn(),
    onUpdateOrder: vi.fn(),
    onConfirmAllHolds: vi.fn(),
    onFinalizeClick: vi.fn(),
    onUnfinalizeClick: vi.fn(),
    onAdjudicateTurn: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
  };

  describe('as the phone order sheet', () => {
    const sheet = (props: Partial<MacroSidebarProps>) =>
      renderToString(
        React.createElement(MacroSidebar, {
          ...baseMacroProps,
          variant: 'sheet',
          sheetSnap: 'peek',
          onSheetSnapChange: vi.fn(),
          ...props,
        }),
      );

    it('puts the power, its counts, Confirm All, Finalize and Resolve in the peek', () => {
      const html = sheet({});
      const peek = html.slice(
        html.indexOf('bottom-sheet-peek'),
        html.indexOf('bottom-sheet-body'),
      );
      expect(peek).toContain('France');
      // The desktop rail only gives the unconfirmed count in a tooltip. React's text
      // separators move whenever the JSX is re-wrapped, so compare the text without them.
      expect(peek.replace(/<!-- -->/g, '')).toContain(
        '2 units · 2 SCs · 1 unconfirmed',
      );
      expect(peek).toContain('data-testid="btn-confirm-all"');
      expect(peek).toContain('data-testid="btn-finalize-orders"');
      expect(peek).toContain('data-testid="btn-adjudicate-phase"');
    });

    it('keeps the unit cards in the body, and never shows a rail', () => {
      const html = sheet({ collapsed: true });
      const body = html.slice(html.indexOf('bottom-sheet-body'));
      expect(body).toContain('ACTIVE FORCE ORDERS (2 UNITS)');
      expect(body).toContain('data-unit-id="A_PAR"');
      expect(html).not.toContain('data-testid="macro-sidebar-collapsed"');
      expect(html).not.toContain('data-testid="macro-sidebar-collapse-btn"');
    });

    it('makes the body inert while lowered, since it is off screen', () => {
      expect(sheet({ sheetSnap: 'peek' })).toMatch(
        /data-testid="bottom-sheet-body"[^>]*inert/,
      );
      expect(sheet({ sheetSnap: 'half' })).not.toMatch(
        /data-testid="bottom-sheet-body"[^>]*inert/,
      );
    });

    it('moves Surrender into the body in a match', () => {
      const html = sheet({ isMultiplayer: true, onSurrenderClick: vi.fn() });
      const peek = html.slice(
        html.indexOf('bottom-sheet-peek'),
        html.indexOf('bottom-sheet-body'),
      );
      expect(peek).not.toContain('Surrender');
      expect(html.slice(html.indexOf('bottom-sheet-body'))).toContain(
        'data-testid="macro-sheet-surrender"',
      );
    });

    it('leaves the desktop panel as it was', () => {
      const html = renderToString(
        React.createElement(MacroSidebar, baseMacroProps),
      );
      expect(html).not.toContain('data-testid="bottom-sheet-handle"');
      expect(html).toContain('aria-label="Tactical Command &amp; Orders"');
    });
  });

  it('renders collapsed rail view when collapsed is true', () => {
    const html = renderToString(
      React.createElement(MacroSidebar, { ...baseMacroProps, collapsed: true }),
    );
    expect(html).toContain('aria-label="Tactical Orders Collapsed"');
    expect(html).toContain('data-testid="macro-sidebar-collapsed"');
    expect(html).toContain('data-testid="rail-power-crest"');
    expect(html).not.toContain('ACTIVE FORCE ORDERS');
  });

  it('renders expanded gameplay view with units and turn resolution actions', () => {
    const html = renderToString(
      React.createElement(MacroSidebar, baseMacroProps),
    );
    expect(html).toContain('aria-label="Tactical Command &amp; Orders"');
    expect(html).toContain('France');
    expect(html).toContain('ACTIVE FORCE ORDERS (2 UNITS)');
    expect(html).toContain('Paris');
    expect(html).toContain('Brest');
    expect(html).toContain('Finalize');
    expect(html).toContain('France');
    expect(html).toContain('Orders');
    expect(html).toContain('Resolve Phase');
  });

  it('renders Winter Adjustment instructions and build targets', () => {
    const html = renderToString(
      React.createElement(MacroSidebar, {
        ...baseMacroProps,
        phase: 'Adjustments',
        season: 'Winter',
        builds: {
          AUSTRIA: { count: 0, homes: [] },
          ENGLAND: { count: 0, homes: [] },
          FRANCE: { count: 1, homes: ['PAR'] },
          GERMANY: { count: 0, homes: [] },
          ITALY: { count: 0, homes: [] },
          RUSSIA: { count: 0, homes: [] },
          TURKEY: { count: 0, homes: [] },
        },
      }),
    );
    expect(html).toContain('WINTER ADJUSTMENTS:');
    expect(html).toContain('HOME BUILDS');
  });

  it('renders Retreat instructions when dislodged units are present', () => {
    const dislodgedUnit: Unit = {
      id: 'A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      province: 'PAR',
      coast: null,
      is_dislodged: true,
    };
    const html = renderToString(
      React.createElement(MacroSidebar, {
        ...baseMacroProps,
        units: [dislodgedUnit],
        phase: 'Retreats',
        retreats: {
          FRANCE: { A_PAR: ['BRE', 'BUR'] },
          AUSTRIA: {},
          ENGLAND: {},
          GERMANY: {},
          ITALY: {},
          RUSSIA: {},
          TURKEY: {},
        },
      }),
    );
    expect(html).toContain('RETREAT PHASE:');
    expect(html).toContain('1 dislodged unit must Retreat or Disband');
  });
  describe('multiplayer resolution status', () => {
    const seat = (power: Power) => ({
      user_id: power,
      email: `${power}@test.com`,
      display_name: power,
      power,
      joined_at: '2026-11-06T00:00:00Z',
      surrendered: false,
    });
    const match = (overrides: Partial<MacroSidebarProps>) =>
      renderToString(
        React.createElement(MacroSidebar, {
          ...baseMacroProps,
          isMultiplayer: true,
          ...overrides,
        }),
      );

    it('does not promise to resolve before a second player joins', () => {
      const html = match({
        lobbyStatus: 'waiting',
        participants: { FRANCE: seat('FRANCE') },
        finalizedPowers: ['FRANCE'],
      });
      expect(html).toContain('Waiting for Players');
      expect(html).not.toContain('Resolving phase');
    });

    it('reports progress once two players are seated', () => {
      const html = match({
        units: [
          ...mockUnits,
          {
            ...mockUnits[0],
            id: 'GER_A_BER',
            power: 'GERMANY',
            province: 'BRE',
          },
        ],
        participants: { FRANCE: seat('FRANCE'), GERMANY: seat('GERMANY') },
        finalizedPowers: ['FRANCE'],
      });
      expect(html).toContain('Resolution Progress: 1/2 Ready');
      expect(html).toContain('Waiting on: Germany');
    });

    it('does not wait for a power with no room to build', () => {
      const html = match({
        phase: 'Adjustments',
        season: 'Winter',
        builds: {
          FRANCE: { count: 1, homes: [] },
          GERMANY: { count: 1, homes: ['BRE'] },
        } as unknown as MacroSidebarProps['builds'],
        participants: { FRANCE: seat('FRANCE'), GERMANY: seat('GERMANY') },
      });
      expect(html).toContain('Resolution Progress: 0/1 Ready');
      expect(html).toContain('Waiting on: Germany');
    });
  });

  it('never bleeds foreign issues onto activePower cards and does not count info notes as warnings', () => {
    const foreignLeakAttempt = {
      id: 'eng_convoy_info',
      severity: 'info' as const,
      code: 'BROKEN_CONVOY' as const,
      title: 'Foreign Convoy for France in Paris',
      message: 'Secret England North Sea order',
      unit_ids: [mockUnits[0].id],
      provinces: ['PAR'],
      power: 'ENGLAND' as const,
    };
    const ownInfoNote = {
      id: 'fra_convoy_info',
      severity: 'info' as const,
      code: 'BROKEN_CONVOY' as const,
      title: 'Foreign Convoy Required',
      message: 'Requires allied fleet',
      unit_ids: [mockUnits[0].id],
      provinces: ['PAR'],
      power: 'FRANCE' as const,
    };
    const macroHtml = renderToString(
      React.createElement(MacroSidebar, {
        ...baseMacroProps,
        issues: [foreignLeakAttempt, ownInfoNote],
      }),
    );
    expect(macroHtml).not.toContain('Secret England North Sea order');
    expect(macroHtml).toContain('Foreign Convoy Required');
    expect(macroHtml).not.toContain('has-warnings');
    expect(macroHtml).not.toContain('Finalize France (');

    const toolsHtml = renderToString(
      React.createElement(ToolsSidebar, {
        collapsed: false,
        onToggleCollapse: vi.fn(),
        zoomPercent: 100,
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onResetCamera: vi.fn(),
        activePower: 'FRANCE',
        onSelectPower: vi.fn(),
        ownership: mockOwnership,
        units: mockUnits,
        finalizedPowers: [],
        sandboxMode: false,
        onToggleSandboxMode: vi.fn(),
        onClearForeignPreMoves: vi.fn(),
        foreignModifiedOrdersCount: 0,
        onLoadScenario: vi.fn(),
        isMultiplayer: false,
        issues: [{ ...foreignLeakAttempt, severity: 'warning' }, ownInfoNote],
      }),
    );
    // Neither England's warning (sandboxMode is false) nor France's info note shows a ⚠ tag!
    expect(toolsHtml).not.toContain('data-status="warning"');
  });
});
