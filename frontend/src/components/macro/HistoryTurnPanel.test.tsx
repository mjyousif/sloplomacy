// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProvinceInfo, TurnRecord } from '../../types/diplomacy';
import { HistoryTurnPanel } from './HistoryTurnPanel';

const PROVINCES: Record<string, ProvinceInfo> = {
  PAR: { name: 'Paris' } as ProvinceInfo,
  BUR: { name: 'Burgundy' } as ProvinceInfo,
  MUN: { name: 'Munich' } as ProvinceInfo,
  LON: { name: 'London' } as ProvinceInfo,
  NTH: { name: 'North Sea' } as ProvinceInfo,
  BEL: { name: 'Belgium' } as ProvinceInfo,
};

const MOVEMENT_TURN = {
  index: 0,
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  ownership: { PAR: 'FRANCE', MUN: 'GERMANY', LON: 'ENGLAND' },
  units: [
    {
      id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      province: 'PAR',
      is_dislodged: false,
    },
    {
      id: 'GER_A_MUN',
      power: 'GERMANY',
      unit_type: 'A',
      province: 'MUN',
      is_dislodged: false,
    },
    {
      id: 'ENG_F_LON',
      power: 'ENGLAND',
      unit_type: 'F',
      province: 'LON',
      is_dislodged: false,
    },
  ],
  orders: {
    FRA_A_PAR: {
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'MOVE',
      target: 'BUR',
      via_convoy: false,
      is_explicit: true,
    },
    GER_A_MUN: {
      unit_id: 'GER_A_MUN',
      power: 'GERMANY',
      unit_type: 'A',
      origin: 'MUN',
      order_type: 'MOVE',
      target: 'BUR',
      via_convoy: false,
      is_explicit: true,
    },
    ENG_F_LON: {
      unit_id: 'ENG_F_LON',
      power: 'ENGLAND',
      unit_type: 'F',
      province: 'LON',
      origin: 'LON',
      order_type: 'MOVE',
      target: 'NTH',
      via_convoy: false,
      is_explicit: true,
    },
  },
  resolution: {
    summary: [],
    new_units: [],
    new_ownership: {},
    resolutions: {
      FRA_A_PAR: {
        unit_id: 'FRA_A_PAR',
        origin: 'PAR',
        order_type: 'MOVE',
        target: 'BUR',
        succeeded: false,
        bounced: true,
        cut: false,
        dislodged: false,
        attack_strength: 1,
        defense_strength: 1,
        reason: 'Bounced attempting to move to Burgundy (strength 1).',
      },
      GER_A_MUN: {
        unit_id: 'GER_A_MUN',
        origin: 'MUN',
        order_type: 'MOVE',
        target: 'BUR',
        succeeded: false,
        bounced: true,
        cut: false,
        dislodged: false,
        attack_strength: 1,
        defense_strength: 1,
        reason: 'Bounced attempting to move to Burgundy (strength 1).',
      },
      ENG_F_LON: {
        unit_id: 'ENG_F_LON',
        origin: 'LON',
        order_type: 'MOVE',
        target: 'NTH',
        succeeded: true,
        bounced: false,
        cut: false,
        dislodged: false,
        attack_strength: 1,
        defense_strength: 1,
        reason: 'Moved cleanly to North Sea.',
      },
    },
  },
} as unknown as TurnRecord;

describe('HistoryTurnPanel', () => {
  it('renders unified Viewing header, Filter by nation bar, and order cards without Back to live, verb badges, or counts', () => {
    const onToggleCollapse = vi.fn();
    const { container } = render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        provinces={PROVINCES}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    expect(container.querySelector('[inert]')).toBeNull();
    const scrollPanel = screen.getByTestId('history-panel-scroll');
    const lockBar = screen.getByTestId('history-lock-bar');
    expect(scrollPanel).toContainElement(lockBar);
    expect(lockBar).toHaveTextContent('Viewing Spring 1901 Movement');
    expect(screen.getByTestId('history-lock-filter-header')).toHaveTextContent(
      'Filters',
    );
    expect(screen.getByText('Nations')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.queryByTestId('history-lock-live-btn')).toBeNull();
    expect(screen.queryByTestId('btn-toggle-compact-orders')).toBeNull();
    expect(screen.queryByTestId('history-lock-filter-note')).toBeNull();
    expect(screen.queryByTestId('history-summary-banner')).toBeNull();
    expect(screen.queryByText(/MOVEMENT LOG/i)).toBeNull();
    expect(screen.queryByText(/\d+ orders?/i)).toBeNull();
    expect(screen.queryByText('MOVE')).toBeNull();
    expect(screen.queryByText('HOLD')).toBeNull();
    expect(screen.getAllByTestId('history-power-group')).toHaveLength(3);
    expect(screen.getAllByTestId('history-order-item')).toHaveLength(3);
    const unitIcons = screen.getAllByTestId('history-order-unit-icon');
    expect(unitIcons).toHaveLength(3);
    const fleetIcon = unitIcons.find(
      (el) => el.getAttribute('data-unit-type') === 'F',
    )!;
    const armyIcon = unitIcons.find(
      (el) => el.getAttribute('data-unit-type') === 'A',
    )!;
    expect(fleetIcon.querySelector('polygon')).not.toBeNull();
    expect(armyIcon.querySelector('circle')).not.toBeNull();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.queryByText('A Paris')).toBeNull();
    expect(
      screen.getAllByText(
        'Bounced attempting to move to Burgundy (strength 1).',
      ),
    ).toHaveLength(2);
    expect(screen.queryByTestId('btn-clear-all')).toBeNull();
    expect(screen.queryByTestId('btn-finalize-orders')).toBeNull();

    fireEvent.click(screen.getByTestId('macro-sidebar-collapse-btn'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('calls hover and pin callbacks when mousing over and clicking an order', () => {
    const onHoverOrder = vi.fn();
    const onTogglePinOrder = vi.fn();
    render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        provinces={PROVINCES}
        selectedOrderId="GER_A_MUN"
        onHoverOrder={onHoverOrder}
        onTogglePinOrder={onTogglePinOrder}
      />,
    );

    const rows = screen.getAllByTestId('history-order-item');
    const munRow = rows.find((el) => el.dataset.orderId === 'GER_A_MUN')!;
    expect(munRow).toHaveAttribute('data-selected', 'true');
    expect(munRow).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerEnter(munRow, { pointerType: 'touch' });
    expect(onHoverOrder).not.toHaveBeenCalled();

    fireEvent.pointerEnter(munRow, { pointerType: 'mouse' });
    expect(onHoverOrder).toHaveBeenCalledWith({
      id: 'GER_A_MUN',
      unitId: 'GER_A_MUN',
      provinces: ['MUN', 'BUR'],
    });

    fireEvent.pointerLeave(munRow, { pointerType: 'mouse' });
    expect(onHoverOrder).toHaveBeenLastCalledWith(null);

    fireEvent.click(munRow);
    expect(onTogglePinOrder).toHaveBeenCalledWith({
      id: 'GER_A_MUN',
      unitId: 'GER_A_MUN',
      provinces: ['MUN', 'BUR'],
    });
  });

  it('filters displayed groups to single or multiple selected nations via chips under Viewing header and omits Filtering note', () => {
    const onSelectHistoryPowers = vi.fn();
    const { rerender } = render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={['GERMANY']}
        unitMark="vehicles"
        provinces={PROVINCES}
        onSelectHistoryPowers={onSelectHistoryPowers}
      />,
    );

    expect(
      screen
        .getAllByTestId('history-power-group')
        .map((g) => g.getAttribute('data-power')),
    ).toEqual(['GERMANY']);
    expect(screen.queryByTestId('history-lock-filter-note')).toBeNull();
    expect(screen.queryByText(/Filtering:/i)).toBeNull();
    const chips = screen.getAllByTestId('turn-history-power');
    expect(
      chips.find((el) => el.getAttribute('data-power') === 'GERMANY'),
    ).toHaveAttribute('data-active', 'true');
    fireEvent.click(
      chips.find((el) => el.getAttribute('data-power') === 'ENGLAND')!,
    );
    expect(onSelectHistoryPowers).toHaveBeenCalledWith(['ENGLAND', 'GERMANY']);
    expect(screen.getByTestId('history-order-unit-icon')).toHaveAttribute(
      'data-unit-mark',
      'vehicles',
    );

    rerender(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={['FRANCE', 'ENGLAND']}
        unitMark="letters"
        provinces={PROVINCES}
        onSelectHistoryPowers={onSelectHistoryPowers}
      />,
    );

    expect(
      screen
        .getAllByTestId('history-power-group')
        .map((g) => g.getAttribute('data-power')),
    ).toEqual(['FRANCE', 'ENGLAND']);
    expect(screen.queryByTestId('history-lock-filter-note')).toBeNull();
    expect(screen.getAllByTestId('history-order-unit-icon')[0]).toHaveAttribute(
      'data-unit-mark',
      'letters',
    );
  });

  it('shows empty filter state and lets the user reset both nation and action filters', () => {
    const onSelectHistoryPowers = vi.fn();
    const onSelectHistoryActions = vi.fn();
    render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={['ITALY']}
        historyActions={['HOLD']}
        provinces={PROVINCES}
        onSelectHistoryPowers={onSelectHistoryPowers}
        onSelectHistoryActions={onSelectHistoryActions}
      />,
    );

    expect(screen.getByTestId('history-empty')).toHaveTextContent(
      'No orders match the selected filters on this turn.',
    );
    fireEvent.click(screen.getByTestId('history-empty-clear-filter'));
    expect(onSelectHistoryPowers).toHaveBeenCalledWith([]);
    expect(onSelectHistoryActions).toHaveBeenCalledWith([]);
  });

  it('renders Admin ownership edits cleanly and supports highlighting them', () => {
    const onHoverOrder = vi.fn();
    const adminTurn = {
      index: 1,
      season: 'Spring',
      year: 1901,
      phase: 'Admin',
      ownership: { BEL: 'FRANCE' },
      units: [],
      orders: {
        BUILD_GERMANY_MUN: {
          unit_id: 'BUILD_GERMANY_MUN',
          power: 'GERMANY',
          unit_type: 'A',
          origin: 'MUN',
          order_type: 'BUILD',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: { BEL: 'GERMANY' },
        resolutions: {},
      },
    } as unknown as TurnRecord;

    render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={adminTurn}
        historyLabel="Spring 1901 — Admin Edit"
        historyIsAdmin
        historyPowers={[]}
        provinces={PROVINCES}
        onHoverOrder={onHoverOrder}
      />,
    );

    expect(screen.getByTestId('history-lock-bar')).toHaveAttribute(
      'data-admin-phase',
      'true',
    );
    const ownItem = screen.getByTestId('history-ownership-item');
    expect(ownItem).toHaveTextContent('Belgium');
    expect(ownItem).toHaveTextContent('France → Germany');
    fireEvent.pointerEnter(ownItem, { pointerType: 'mouse' });
    expect(onHoverOrder).toHaveBeenCalledWith({
      id: 'own_BEL',
      unitId: null,
      provinces: ['BEL'],
    });
  });

  it('shows Territorial Changes section on movement turns when territory changes hands', () => {
    const provsWithSC = {
      ...PROVINCES,
      BEL: {
        name: 'Belgium',
        is_supply_center: true,
        home_power: null,
        type: 'COAST',
      } as ProvinceInfo,
    };
    const fallTurn = {
      ...MOVEMENT_TURN,
      season: 'Fall',
      ownership: { PAR: 'FRANCE', MUN: 'GERMANY', LON: 'ENGLAND' },
      resolution: {
        ...MOVEMENT_TURN.resolution,
        new_ownership: {
          PAR: 'FRANCE',
          MUN: 'GERMANY',
          LON: 'ENGLAND',
          BEL: 'GERMANY',
        },
      },
    } as unknown as TurnRecord;

    render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={fallTurn}
        historyLabel="Fall 1901 Movement"
        historyPowers={['GERMANY']}
        provinces={provsWithSC}
      />,
    );

    const list = screen.getByTestId('history-orders-list');
    const ownershipSection = screen.getByTestId('history-ownership-section');
    const ordersSection = screen.getByTestId('history-orders-section');
    expect(Array.from(list.children).indexOf(ownershipSection)).toBeLessThan(
      Array.from(list.children).indexOf(ordersSection),
    );
    expect(ownershipSection).toHaveTextContent('Territorial Changes');
    expect(ordersSection).toHaveTextContent('Orders by Nation');

    const ownGroup = screen.getByTestId('history-ownership-group');
    expect(ownGroup).toHaveTextContent('Belgium');
    expect(ownGroup).toHaveTextContent('Neutral → Germany');
    const starBadge = screen.getByTestId('history-ownership-sc');
    expect(starBadge.tagName.toLowerCase()).toBe('svg');
    expect(starBadge.querySelector('circle')).not.toBeNull();
    expect(starBadge.querySelector('polygon')).not.toBeNull();
  });

  it('renders compact one-line rows when compactOrders is true while keeping the toggle hidden for now', () => {
    const turnWithHold = {
      ...MOVEMENT_TURN,
      orders: {
        ...MOVEMENT_TURN.orders,
        ENG_F_LON: {
          unit_id: 'ENG_F_LON',
          power: 'ENGLAND',
          unit_type: 'F',
          origin: 'LON',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        ...MOVEMENT_TURN.resolution,
        resolutions: {
          ...MOVEMENT_TURN.resolution.resolutions,
          ENG_F_LON: {
            unit_id: 'ENG_F_LON',
            origin: 'LON',
            order_type: 'HOLD',
            target: null,
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Held cleanly.',
          },
        },
      },
    } as unknown as TurnRecord;

    const { rerender } = render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={turnWithHold}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        historyActions={['HOLD']}
        provinces={PROVINCES}
        compactOrders={false}
        onSelectHistoryActions={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('btn-toggle-compact-orders')).toBeNull();
    expect(screen.getAllByTestId('history-order-item')).toHaveLength(1);
    expect(screen.getByText('Defending London')).toBeInTheDocument();

    rerender(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={turnWithHold}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        historyActions={[]}
        provinces={PROVINCES}
        compactOrders={true}
        onSelectHistoryActions={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('btn-toggle-compact-orders')).toBeNull();
    expect(screen.getAllByTestId('history-order-item')).toHaveLength(3);
    expect(screen.queryByText('Defending London')).toBeNull();
    expect(
      screen.queryByText(
        'Bounced attempting to move to Burgundy (strength 1).',
      ),
    ).toBeNull();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getAllByText('→ Burgundy')).toHaveLength(2);
    expect(screen.getAllByTestId('history-order-item')[0]).toHaveAttribute(
      'data-compact',
      'true',
    );
  });

  it('renders cleanly in phone sheet variant without dimmed controls', () => {
    const { container } = render(
      <HistoryTurnPanel
        variant="sheet"
        sheetSnap="half"
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={['FRANCE', 'GERMANY']}
        provinces={PROVINCES}
      />,
    );

    const peek = screen.getByTestId('macro-sheet-peek');
    expect(peek).not.toHaveAttribute('data-history-locked');
    expect(
      container.querySelector('[data-testid="macro-sheet-peek"]'),
    ).not.toHaveTextContent('Hold');
    expect(container.querySelector('[inert]')).toBeNull();
    expect(screen.getAllByTestId('history-order-item')).toHaveLength(2);
    expect(screen.queryByTestId('history-peek-selection')).toBeNull();
  });

  it('auto-drops to peek when pinning an order in sheet mode, summarizes it in the peek, and unpins it', () => {
    const onSheetSnapChange = vi.fn();
    const onTogglePinOrder = vi.fn();
    const { rerender } = render(
      <HistoryTurnPanel
        variant="sheet"
        sheetSnap="half"
        onSheetSnapChange={onSheetSnapChange}
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        provinces={PROVINCES}
        selectedOrderId={null}
        onTogglePinOrder={onTogglePinOrder}
      />,
    );

    const munRow = screen
      .getAllByTestId('history-order-item')
      .find((el) => el.dataset.orderId === 'GER_A_MUN')!;
    fireEvent.click(munRow);
    expect(onTogglePinOrder).toHaveBeenCalledWith({
      id: 'GER_A_MUN',
      unitId: 'GER_A_MUN',
      provinces: ['MUN', 'BUR'],
    });
    expect(onSheetSnapChange).toHaveBeenCalledWith('peek');

    rerender(
      <HistoryTurnPanel
        variant="sheet"
        sheetSnap="peek"
        onSheetSnapChange={onSheetSnapChange}
        historyTurn={MOVEMENT_TURN}
        historyLabel="Spring 1901 Movement"
        historyPowers={[]}
        provinces={PROVINCES}
        selectedOrderId="GER_A_MUN"
        onTogglePinOrder={onTogglePinOrder}
      />,
    );
    const summary = screen.getByTestId('history-peek-selection');
    expect(summary).toHaveTextContent('Munich');
    expect(summary).toHaveTextContent('Bounced');
    fireEvent.click(screen.getByRole('button', { name: 'Open turn log' }));
    expect(onSheetSnapChange).toHaveBeenLastCalledWith('half');

    fireEvent.click(screen.getByTestId('history-peek-clear-pin'));
    expect(onTogglePinOrder).toHaveBeenLastCalledWith({
      id: 'GER_A_MUN',
      unitId: 'GER_A_MUN',
      provinces: ['MUN', 'BUR'],
    });
  });

  it('filters Winter Adjustments orders by Build, Disband, and Waive actions', () => {
    const onSelectHistoryActions = vi.fn();
    const winterTurn = {
      index: 2,
      season: 'Winter',
      year: 1901,
      phase: 'Adjustments',
      ownership: { PAR: 'FRANCE', MUN: 'GERMANY', LON: 'ENGLAND' },
      units: [
        {
          id: 'GER_A_MUN',
          power: 'GERMANY',
          unit_type: 'A',
          province: 'MUN',
          is_dislodged: false,
        },
      ],
      orders: {
        BUILD_FRANCE_PAR: {
          unit_id: 'BUILD_FRANCE_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'BUILD',
          via_convoy: false,
          is_explicit: true,
        },
        BUILD_ENGLAND_LON: {
          unit_id: 'BUILD_ENGLAND_LON',
          power: 'ENGLAND',
          unit_type: 'A',
          origin: 'LON',
          order_type: 'WAIVE',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: {},
        resolutions: {
          GER_A_MUN: {
            unit_id: 'GER_A_MUN',
            origin: 'MUN',
            order_type: 'DISBAND',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Disbanded per deficit.',
          },
        },
      },
    } as unknown as TurnRecord;

    const { rerender } = render(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={winterTurn}
        historyLabel="Winter 1901 Adjustments"
        historyPowers={[]}
        historyActions={['BUILD']}
        provinces={PROVINCES}
        onSelectHistoryActions={onSelectHistoryActions}
      />,
    );

    expect(
      screen
        .getAllByTestId('turn-history-action')
        .map((el) => el.getAttribute('data-action')),
    ).toEqual(['BUILD', 'DISBAND', 'WAIVE']);
    expect(
      screen
        .getAllByTestId('history-power-group')
        .map((el) => el.getAttribute('data-power')),
    ).toEqual(['FRANCE']);

    rerender(
      <HistoryTurnPanel
        variant="panel"
        historyTurn={winterTurn}
        historyLabel="Winter 1901 Adjustments"
        historyPowers={[]}
        historyActions={['DISBAND', 'WAIVE']}
        provinces={PROVINCES}
        onSelectHistoryActions={onSelectHistoryActions}
      />,
    );

    expect(
      screen
        .getAllByTestId('history-power-group')
        .map((el) => el.getAttribute('data-power')),
    ).toEqual(['ENGLAND', 'GERMANY']);
  });
});
