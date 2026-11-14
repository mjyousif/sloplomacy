// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, orderFor, unitAt } from '../test/mapFixtures';
import { type Order, POWER_METADATA, type Power } from '../types/diplomacy';
import { EuropeMap, type EuropeMapProps } from './EuropeMap';
import { MacroSidebar } from './MacroSidebar';

const PAR = unitAt('FRANCE', 'A', 'PAR');
const MAR = unitAt('FRANCE', 'A', 'MAR');

/** The map with its selection held the way App holds it. */
function MapWithSelection(props: Partial<EuropeMapProps>) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  return (
    <EuropeMap
      provinces={FRANCE_PROVINCES}
      units={[PAR, MAR]}
      orders={{}}
      ownership={{}}
      activePower="FRANCE"
      sandboxMode={false}
      selectedUnitId={selectedUnitId}
      hoveredUnitId={null}
      highlightedProvinces={[]}
      issues={[]}
      simulationResult={null}
      showSimulationOverlay={false}
      onSelectUnit={setSelectedUnitId}
      onHoverUnit={() => {}}
      onUpdateOrder={() => {}}
      onClearSimulationOverlay={() => {}}
      onAdjudicateTurn={() => {}}
      pieceStyle="classic"
      unitMark="letters"
      {...props}
    />
  );
}

const unitToken = (id: string) =>
  document.querySelector<SVGGElement>(
    `[data-testid="unit-token"][data-unit-id="${id}"]`,
  )!;
const menuButton = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}$`) });

const DIRECT_EDIT_PROVINCES = {
  ...FRANCE_PROVINCES,
  ENG: {
    ...FRANCE_PROVINCES.BRE,
    id: 'ENG',
    name: 'English Channel',
    type: 'SEA' as const,
    is_supply_center: false,
    home_power: null,
  },
};

function DirectEditMap({
  onStageRelocateUnit,
  onStageSpawnOrUpdateUnit = vi.fn(() => true),
  onStageOwnership = vi.fn(),
  onStageUnitOrder = vi.fn(),
  diffLines = ['Relocated France Army from Paris to Burgundy'],
  onUndoStagedChange = vi.fn(),
  applyChanges = vi.fn(),
  clearStagedChanges = vi.fn(),
}: {
  onStageRelocateUnit: (
    unitId: string,
    targetProv: string,
    targetCoast?: string | null,
  ) => boolean;
  onStageSpawnOrUpdateUnit?: (
    province: string,
    power: Power,
    unitType: 'A' | 'F',
    coast?: string | null,
  ) => boolean;
  onStageOwnership?: (province: string, power: Power | null) => void;
  onStageUnitOrder?: (order: Order) => void;
  diffLines?: string[];
  onUndoStagedChange?: (changeId: string) => void;
  applyChanges?: () => void;
  clearStagedChanges?: () => void;
}) {
  const [inspectedProvince, setInspectedProvince] = useState<string | null>(
    null,
  );
  const [relocatingUnitId, setRelocatingUnitId] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<Record<string, Power>>({
    PAR: 'FRANCE',
  });
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const handleStageUnitOrder = (order: Order) => {
    setOrders((prev) => ({ ...prev, [order.unit_id]: order }));
    onStageUnitOrder?.(order);
  };
  const handleStageOwnership = (prov: string, pwr: Power | null) => {
    setOwnership((prev) => {
      const next = { ...prev };
      if (pwr) next[prov] = pwr;
      else delete next[prov];
      return next;
    });
    onStageOwnership?.(prov, pwr);
  };
  const directEdit = {
    inspectedProvince,
    setInspectedProvince,
    relocatingUnitId,
    setRelocatingUnitId,
    stagedChanges: diffLines.map((label, idx) => ({
      id: `change:${idx}`,
      kind: 'relocate' as const,
      label,
    })),
    diffLines,
    onUndoStagedChange,
    applyChanges,
    clearStagedChanges,
    onStageRelocateUnit,
    onStageSpawnOrUpdateUnit,
    onStageDestroyUnit: vi.fn(),
    onStageOwnership: handleStageOwnership,
    onStageUnitOrder: handleStageUnitOrder,
  };
  return (
    <div>
      <MapWithSelection
        provinces={DIRECT_EDIT_PROVINCES}
        directEditActive={true}
        ownership={ownership}
        orders={orders}
        directEdit={directEdit}
      />
      <MacroSidebar
        provinces={DIRECT_EDIT_PROVINCES}
        units={[PAR, MAR]}
        orders={orders}
        ownership={{ PAR: 'FRANCE' }}
        activePower="FRANCE"
        finalizedPowers={[]}
        sandboxMode={false}
        selectedUnitId={null}
        hoveredUnitId={null}
        issues={[]}
        simulationResult={null}
        showSimulationOverlay={false}
        onSelectUnit={() => {}}
        onHoverUnit={() => {}}
        onHighlightProvinces={() => {}}
        onUpdateOrder={() => {}}
        onConfirmAllHolds={() => {}}
        onFinalizeClick={() => {}}
        onUnfinalizeClick={() => {}}
        onAdjudicateTurn={() => {}}
        directEditActive={true}
        directEdit={directEdit}
      />
    </div>
  );
}

describe('EuropeMap unit menu', () => {
  it('shows a saved Hold on each newly selected unit, even after Move was pressed on the last one', () => {
    const orders: Record<string, Order> = {
      [PAR.id]: orderFor(PAR, 'HOLD'),
      [MAR.id]: orderFor(MAR, 'HOLD'),
    };
    render(<MapWithSelection orders={orders} />);

    fireEvent.click(unitToken(PAR.id));
    expect(menuButton('Hold')).toHaveAttribute('data-state', 'hold');
    fireEvent.click(menuButton('Move'));
    expect(menuButton('Move')).toHaveAttribute('data-state', 'active');
    expect(menuButton('Hold')).not.toHaveAttribute('data-state', 'hold');

    // Pressing Move belonged to Paris. Marseilles' saved Hold shows as it is.
    fireEvent.click(unitToken(MAR.id));
    expect(screen.getByText('Army Marseilles')).toBeInTheDocument();
    expect(menuButton('Hold')).toHaveAttribute('data-state', 'hold');
    expect(menuButton('Move')).not.toHaveAttribute('data-state', 'active');
  });

  it("opens the next unit's menu where it belongs, not where the last one was dragged", () => {
    const { container } = render(<MapWithSelection />);
    const menu = () =>
      container.querySelector<HTMLDivElement>(
        '[data-testid="unit-floating-menu"]',
      )!;
    const position = () => ({ left: menu().style.left, top: menu().style.top });

    // Where Marseilles' menu opens when nothing has been dragged.
    fireEvent.click(unitToken(MAR.id));
    const marseillesHome = position();
    fireEvent.click(unitToken(MAR.id)); // deselect

    // Drag Paris' menu 120px right and 60px down by its header.
    fireEvent.click(unitToken(PAR.id));
    const header = menu().querySelector<HTMLDivElement>(
      '[data-testid="floating-menu-header"]',
    )!;
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = vi.fn(() => true);
    fireEvent.pointerDown(header, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(header, { clientX: 320, clientY: 260 });
    fireEvent.lostPointerCapture(header);

    // Straight from Paris to Marseilles, without closing the menu first.
    fireEvent.click(unitToken(MAR.id));
    expect(screen.getByText('Army Marseilles')).toBeInTheDocument();
    expect(position()).toEqual(marseillesHome);
  });

  it('requires clicking Move in AdminTileInspector before relocating a unit, places Move and Destroy on the same row below Order, shows staged controls in Edit Board Inspector, and ignores clicks and hover highlights on incompatible areas', () => {
    const onStageRelocateUnit = vi.fn(() => true);
    const onStageSpawnOrUpdateUnit = vi.fn(() => true);
    const onStageOwnership = vi.fn();
    const onUndoStagedChange = vi.fn();
    const applyChanges = vi.fn();
    const clearStagedChanges = vi.fn();
    const { container } = render(
      <DirectEditMap
        onStageRelocateUnit={onStageRelocateUnit}
        onStageSpawnOrUpdateUnit={onStageSpawnOrUpdateUnit}
        onStageOwnership={onStageOwnership}
        onUndoStagedChange={onUndoStagedChange}
        applyChanges={applyChanges}
        clearStagedChanges={clearStagedChanges}
      />,
    );

    // Edit Board Inspector header has staged changes pill, Apply, and Clear on the same row
    const actionsRow = screen.getByTestId('admin-sidebar-actions-row');
    expect(actionsRow).toContainElement(
      screen.getByTestId('admin-staged-pill-wrap'),
    );
    const stagedPill = screen.getByTestId('admin-staged-count');
    expect(stagedPill).toHaveTextContent('1 staged change');
    expect(screen.queryByTestId('admin-staged-tooltip')).toBeNull();
    expect(screen.queryByTestId('admin-staged-drawer')).toBeNull();

    // Clicking the staged changes pill expands the staged changes drawer with an icon undo button per change
    fireEvent.click(stagedPill);
    const drawer = screen.getByTestId('admin-staged-drawer');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveTextContent(
      'Relocated France Army from Paris to Burgundy',
    );
    const undoBtn = screen.getByTestId('btn-admin-undo-change-0');
    expect(undoBtn).toHaveTextContent('Undo');
    expect(undoBtn.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(undoBtn);
    expect(onUndoStagedChange).toHaveBeenCalledWith('change:0');
    fireEvent.click(stagedPill);
    expect(screen.queryByTestId('admin-staged-drawer')).toBeNull();
    const applyBtn = screen.getByTestId('btn-admin-apply-edits');
    const clearBtn = screen.getByTestId('btn-admin-clear-edits');
    expect(applyBtn).toHaveTextContent('Apply');
    expect(clearBtn).toHaveTextContent('Clear');
    expect(actionsRow).toContainElement(applyBtn);
    expect(actionsRow).toContainElement(clearBtn);
    const editBoardHeading = screen.getByText('Edit Board');
    expect(editBoardHeading).toBeInTheDocument();
    expect(
      editBoardHeading
        .closest('[data-testid="admin-sidebar-title"]')
        ?.querySelector('.lucide-pencil'),
    ).toBeInTheDocument();
    expect(
      editBoardHeading
        .closest('[data-testid="admin-sidebar-title"]')
        ?.querySelector('.lucide-shield-alert'),
    ).toBeNull();

    fireEvent.click(applyBtn);
    expect(applyChanges).toHaveBeenCalledTimes(1);
    fireEvent.click(clearBtn);
    expect(clearStagedChanges).toHaveBeenCalledTimes(1);

    // Clicking Paris unit opens AdminTileInspector without activating relocate mode
    fireEvent.click(unitToken(PAR.id));
    const inspector = screen.getByTestId('admin-tile-inspector');
    expect(inspector).toBeInTheDocument();
    expect(inspector).toHaveTextContent('Paris');
    expect(screen.getByTestId('admin-inspector-owner-dot')).toBeInTheDocument();
    expect(inspector).not.toHaveTextContent('(PAR)');
    expect(inspector).toHaveTextContent('Province Owner');
    expect(inspector).not.toHaveTextContent('Supply Center Owner');
    expect(inspector).toHaveTextContent('Unit Settings');
    expect(
      screen
        .getByTestId('admin-unit-settings-label')
        .querySelector('.lucide-pencil'),
    ).toBeInTheDocument();
    expect(inspector).toHaveTextContent('Unit Type');
    expect(inspector).toHaveTextContent('Owner');
    expect(inspector).toHaveTextContent('Order');
    expect(
      screen.queryByText(/Direct-Edit changes are staged locally/i),
    ).toBeNull();
    expect(screen.getByTestId('admin-inspector-divider')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-inspector-move-select')).toBeNull();
    const ownerSelect = screen.getByTestId('admin-inspector-ownership-select');
    expect(ownerSelect).toHaveTextContent('France');
    expect(ownerSelect).not.toHaveTextContent('France (FRANCE)');
    expect(
      ownerSelect.querySelector('[data-testid="power-flag-france"]'),
    ).toBeInTheDocument();
    const moveBtn = screen.getByTestId('admin-inspector-relocate-btn');
    const destroyBtn = screen.getByTestId('admin-inspector-destroy-btn');
    const unitActionsRow = screen.getByTestId(
      'admin-inspector-unit-actions-row',
    );
    expect(moveBtn).toHaveTextContent('Move Now');
    expect(destroyBtn).toHaveTextContent('Delete');
    expect(moveBtn).not.toHaveAttribute('data-active');

    // Unit Settings puts unit type buttons before unit owner dropdown (with flags), matching Spawn Unit order
    const unitTypeArmyBtn = screen.getByTestId('admin-inspector-type-A');
    const unitPowerSelect = screen.getByTestId('admin-inspector-unit-power');
    expect(
      unitTypeArmyBtn.compareDocumentPosition(unitPowerSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      unitPowerSelect.querySelector('[data-testid="power-flag-france"]'),
    ).toBeInTheDocument();

    // Move and Delete sit on the same row below Order, and Order uses custom icon dropdown
    const orderSelect = screen.getByTestId('admin-inspector-order-type');
    expect(orderSelect).toHaveTextContent('Hold');
    expect(orderSelect).not.toHaveTextContent('HOLD');
    expect(
      orderSelect.querySelector('[data-testid="admin-order-icon"]'),
    ).toBeInTheDocument();
    fireEvent.click(orderSelect);
    expect(
      screen
        .getByTestId('admin-inspector-order-type-option-move')
        .querySelector('[data-testid="admin-order-icon"]'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId('admin-inspector-order-type-option-disband')
        .querySelector('[data-testid="admin-order-icon"]'),
    ).toBeInTheDocument();
    fireEvent.click(orderSelect);
    const unitHeader = screen.getByTestId('admin-inspector-unit-header');
    expect(unitHeader).toHaveTextContent('Unit Settings');
    expect(unitHeader).toContainElement(unitActionsRow);
    expect(unitActionsRow).toContainElement(moveBtn);
    expect(unitActionsRow).toContainElement(destroyBtn);
    expect(
      unitActionsRow.compareDocumentPosition(orderSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Selecting Move shows the reusable IconSelectDropdown for Move target
    fireEvent.click(orderSelect);
    fireEvent.click(
      screen.getByTestId('admin-inspector-order-type-option-move'),
    );
    const targetDropdown = screen.getByTestId('admin-inspector-order-target');
    expect(targetDropdown.tagName).toBe('BUTTON');
    expect(targetDropdown).toHaveAttribute('aria-haspopup', 'listbox');
    expect(targetDropdown).toHaveTextContent('Target…');
    fireEvent.click(targetDropdown);
    fireEvent.click(
      screen.getByTestId('admin-inspector-order-target-option-bur'),
    );
    expect(targetDropdown).toHaveTextContent('Burgundy (BUR)');

    // Clicking BUR before pressing Move Now inspects BUR instead of relocating PAR, allows changing BUR owner with flag, and gates Spawn Owner dropdown behind unit-type button
    const burPath = container.querySelector<SVGElement>(
      '[data-testid="province-path"][data-province-id="BUR"]',
    )!;
    fireEvent.click(burPath);
    expect(onStageRelocateUnit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-inspector-owner-dot')).toBeNull();
    // Selected province is outlined without overriding its fill color so owner changes appear immediately
    const outline = screen.getByTestId('admin-inspected-province-outline');
    expect(outline).toHaveAttribute('data-province-id', 'BUR');
    expect(outline.querySelector('path[stroke="#ffffff"]')).toBeInTheDocument();
    expect(burPath).toHaveAttribute('fill', '#f4d7b5');
    fireEvent.click(screen.getByTestId('admin-inspector-ownership-select'));
    const englandOwnerOpt = screen.getByTestId(
      'admin-inspector-ownership-select-option-england',
    );
    expect(
      englandOwnerOpt.querySelector('[data-testid="power-flag-england"]'),
    ).toBeInTheDocument();
    fireEvent.click(englandOwnerOpt);
    expect(onStageOwnership).toHaveBeenCalledWith('BUR', 'ENGLAND');
    expect(burPath).toHaveAttribute('fill', POWER_METADATA.ENGLAND.fillColor);
    expect(
      screen.getByTestId('admin-inspected-province-outline'),
    ).toHaveAttribute('data-province-id', 'BUR');

    const burInspector = screen.getByTestId('admin-tile-inspector');
    expect(burInspector).toHaveTextContent('Spawn Unit');
    expect(burInspector).not.toHaveTextContent('Spawn Unit on Tile');
    expect(burInspector).toHaveTextContent('Unit Type');
    expect(burInspector).toHaveTextContent('Owner');
    const spawnArmyBtn = screen.getByTestId('admin-inspector-spawn-army');
    const spawnPowerBtn = screen.getByTestId('admin-inspector-spawn-power');
    expect(
      spawnArmyBtn.compareDocumentPosition(spawnPowerBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(spawnPowerBtn).toBeDisabled();
    fireEvent.click(spawnArmyBtn);
    expect(spawnPowerBtn).toBeEnabled();
    fireEvent.click(spawnPowerBtn);
    const spawnGermanyOpt = screen.getByTestId(
      'admin-inspector-spawn-power-option-germany',
    );
    expect(
      spawnGermanyOpt.querySelector('[data-testid="power-flag-germany"]'),
    ).toBeInTheDocument();
    fireEvent.click(spawnGermanyOpt);
    expect(onStageSpawnOrUpdateUnit).toHaveBeenCalledWith(
      'BUR',
      'GERMANY',
      'A',
      null,
    );

    // Re-select PAR, click Move -> incompatible areas (ENG sea, occupied MAR) get not-allowed cursor
    fireEvent.click(unitToken(PAR.id));
    fireEvent.click(screen.getByTestId('admin-inspector-relocate-btn'));
    expect(
      screen.getByTestId('admin-inspector-relocate-btn'),
    ).toHaveTextContent('Click Map Tile…');
    const engPath = container.querySelector<SVGElement>(
      '[data-testid="province-path"][data-province-id="ENG"]',
    )!;
    const marPath = container.querySelector<SVGElement>(
      '[data-testid="province-path"][data-province-id="MAR"]',
    )!;
    expect(engPath).toHaveAttribute('data-move', 'incompatible');
    expect(engPath.style.cursor).toBe('not-allowed');
    expect(marPath).toHaveAttribute('data-move', 'incompatible');
    expect(marPath.style.cursor).toBe('not-allowed');
    expect(burPath).toHaveAttribute('data-move', 'compatible');
    expect(burPath.style.cursor).toBe('pointer');

    // Hovering incompatible ENG or MAR neither highlights it nor triggers hover ring
    const engFillBeforeHover = engPath.getAttribute('fill-opacity');
    fireEvent.pointerEnter(engPath, { pointerType: 'mouse' });
    expect(engPath.getAttribute('fill-opacity')).toBe(engFillBeforeHover);

    // Clicking incompatible ENG sea, MAR province, or MAR unit does not relocate or switch inspector away from Paris
    fireEvent.click(engPath);
    fireEvent.click(marPath);
    fireEvent.click(unitToken(MAR.id));
    expect(onStageRelocateUnit).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-tile-inspector')).toHaveTextContent(
      'Paris',
    );

    fireEvent.click(burPath);
    expect(onStageRelocateUnit).toHaveBeenCalledWith(PAR.id, 'BUR', undefined);
  });

  it('renders territory ownership change badges when viewing an Admin turn in history', () => {
    const { container } = render(
      <MapWithSelection
        historyView={true}
        phase="Admin"
        ownership={{ PAR: 'FRANCE', BRE: 'FRANCE' }}
        simulationResult={{
          resolutions: {},
          summary: ['[ADMIN OVERRIDE] Set ownership of BRE to GERMANY.'],
          new_units: [PAR, MAR],
          new_ownership: { PAR: 'FRANCE', BRE: 'GERMANY' },
          next_season: 'Spring',
          next_year: 1901,
          next_phase: 'Movement',
          builds: null,
          retreats: null,
          winner: null,
        }}
        showSimulationOverlay={true}
      />,
    );

    const badge = container.querySelector<SVGGElement>(
      '[data-testid="admin-ownership-change"][data-province="BRE"]',
    );
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('data-owner', 'GERMANY');
    expect(badge).toHaveTextContent('OWNER: GERMANY');
  });
});
