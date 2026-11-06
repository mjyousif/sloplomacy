import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ToolsSidebar, ToolsSidebarProps } from './ToolsSidebar';
import { MacroSidebar, MacroSidebarProps } from './MacroSidebar';
import { Order, Power, ProvinceInfo, Unit, ValidationIssue } from '../types/diplomacy';

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
  { id: 'A_PAR', power: 'FRANCE', unit_type: 'A', province: 'PAR', coast: null, is_dislodged: false },
  { id: 'F_BRE', power: 'FRANCE', unit_type: 'F', province: 'BRE', coast: null, is_dislodged: false },
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
    isGameCreator: false,
  };

  it('renders collapsed rail view when collapsed is true', () => {
    const html = renderToString(React.createElement(ToolsSidebar, { ...baseToolsProps, collapsed: true }));
    expect(html).toContain('aria-label="Tools Sidebar Collapsed"');
    expect(html).toContain('tools-sidebar-collapsed');
    expect(html).toContain('Zoom In');
    expect(html).toContain('Zoom Out');
    expect(html).not.toContain('CHANCELLERY TOOLS');
  });

  it('renders expanded tools layout with legend, zoom, powers and sandbox', () => {
    const html = renderToString(React.createElement(ToolsSidebar, baseToolsProps));
    expect(html).toContain('CHANCELLERY TOOLS');
    expect(html).toContain('MAP VIEW &amp; CAMERA');
    expect(html).toContain('105%');
    expect(html).toContain('TACTICAL MAP LEGEND');
    expect(html).toContain('Move / Attack Vector');
    expect(html).toContain('Support Link');
    expect(html).toContain('Fleet Convoy');
    expect(html).toContain('COMMAND NATION (SELECT)');
    expect(html).toContain('France');
    expect(html).toContain('England');
    expect(html).toContain('Germany');
    expect(html).toContain('HYPOTHETICAL MODE &amp; PRE-MOVES');
    expect(html).toContain('Enter Hypothetical Mode');
    expect(html).not.toContain('CREATOR ADMIN TOOLS');
  });

  it('renders creator admin section only when isGameCreator is true', () => {
    const html = renderToString(React.createElement(ToolsSidebar, { ...baseToolsProps, isGameCreator: true, onOpenAdminTools: vi.fn() }));
    expect(html).toContain('CREATOR ADMIN TOOLS');
    expect(html).toContain('Open Admin Console');
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

  it('renders collapsed rail view when collapsed is true', () => {
    const html = renderToString(React.createElement(MacroSidebar, { ...baseMacroProps, collapsed: true }));
    expect(html).toContain('aria-label="Tactical Orders Collapsed"');
    expect(html).toContain('macro-sidebar-collapsed');
    expect(html).toContain('rail-power-crest');
    expect(html).not.toContain('ACTIVE FORCE ORDERS');
  });

  it('renders expanded gameplay view with units and turn resolution actions', () => {
    const html = renderToString(React.createElement(MacroSidebar, baseMacroProps));
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
    const html = renderToString(React.createElement(MacroSidebar, {
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
    }));
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
    const html = renderToString(React.createElement(MacroSidebar, {
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
    }));
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
        React.createElement(MacroSidebar, { ...baseMacroProps, isMultiplayer: true, ...overrides })
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
        units: [...mockUnits, { ...mockUnits[0], id: 'GER_A_BER', power: 'GERMANY', province: 'BRE' }],
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
});
