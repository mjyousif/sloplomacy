// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, unitAt } from '../../../test/mapFixtures';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import {
  convoyOrder,
  holdOrder,
  moveOrder,
  retreatOrder,
  supportOrder,
} from '../../../utils/orderBuilders';
import { useMapInteraction } from './useMapInteraction';
import { useMapSelection } from './useMapSelection';

// France plus two seas and Spain's two coasts, for convoys and coast choices.
const PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  GAS: { ...FRANCE_PROVINCES.GAS, fleet_adj: { '': ['BRE', 'MAO', 'SPA/NC'] } },
  MAO: {
    ...FRANCE_PROVINCES.BRE,
    id: 'MAO',
    name: 'Mid-Atlantic Ocean',
    type: 'SEA',
    is_supply_center: false,
    home_power: null,
    army_adj: [],
    fleet_adj: { '': ['BRE', 'GAS', 'SPA/NC', 'SPA/SC'] },
  },
  SPA: {
    ...FRANCE_PROVINCES.GAS,
    id: 'SPA',
    name: 'Spain',
    coasts: ['NC', 'SC'],
    army_adj: ['GAS', 'MAR'],
    fleet_adj: { NC: ['GAS', 'MAO'], SC: ['MAO', 'MAR'] },
  },
};

interface Board {
  units: Unit[];
  phase?: 'Movement' | 'Retreats' | 'Adjustments';
  retreats?: Record<Power, Record<string, string[]>> | null;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  buildHomes?: Record<string, Power>;
  sandboxMode?: boolean;
  historyView?: boolean;
  activePower?: Power;
}

/** The selection and the click state machine, wired the way EuropeMap wires them. */
function setup(board: Board) {
  const onUpdateOrder = vi.fn<(order: Order) => void>();
  const isPanningRef = { current: false };
  const dragMovedRef = { current: false };
  const phase = board.phase ?? 'Movement';
  const hook = renderHook(() => {
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const { units } = board;
    const { unitsByProv, dislodgedByProv, unitsById } = useMemo(() => {
      const byProv: Record<string, Unit> = {};
      const dislodged: Record<string, Unit> = {};
      const byId: Record<string, Unit> = {};
      for (const u of units) {
        if (u.is_dislodged) dislodged[u.province] = u;
        else byProv[u.province] = u;
        byId[u.id] = u;
      }
      return {
        unitsByProv: byProv,
        dislodgedByProv: dislodged,
        unitsById: byId,
      };
    }, [units]);
    const isAdjustmentPhase = phase === 'Adjustments';
    const isRetreatPhase = phase === 'Retreats';
    const selection = useMapSelection({
      selectedUnitId,
      orders: {},
      unitsById,
      provinces: PROVINCES,
      retreats: board.retreats ?? null,
      activePower: board.activePower ?? 'FRANCE',
      sandboxMode: board.sandboxMode ?? false,
      directEditActive: false,
      historyView: board.historyView ?? false,
      isAdjustmentPhase,
      isRetreatPhase,
    });
    const interaction = useMapInteraction({
      provinces: PROVINCES,
      units,
      builds: board.builds ?? null,
      selectedUnitId,
      onSelectUnit: setSelectedUnitId,
      onUpdateOrder,
      isAdjustmentPhase,
      isRetreatPhase,
      unitsByProv,
      dislodgedByProv,
      controllableBuildHomes: board.buildHomes ?? {},
      selection,
      gestures: { isPanningRef, dragMovedRef },
    });
    return { selectedUnitId, setSelectedUnitId, selection, interaction };
  });
  const r = () => hook.result.current;
  const clickUnit = (u: Unit) =>
    act(() => r().interaction.handleSelectUnitOnMap(u));
  const clickProvince = (id: string, coast?: string) =>
    act(() => r().interaction.onClickProvince(id, coast));
  return {
    r,
    clickUnit,
    clickProvince,
    onUpdateOrder,
    isPanningRef,
    dragMovedRef,
  };
}

const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_BUR = unitAt('FRANCE', 'A', 'BUR');
const A_BRE = unitAt('FRANCE', 'A', 'BRE');
const F_MAO = unitAt('FRANCE', 'F', 'MAO');
const F_GAS = unitAt('FRANCE', 'F', 'GAS');
const A_PIC_GER = unitAt('GERMANY', 'A', 'PIC');
const A_MAR_ITA = unitAt('ITALY', 'A', 'MAR');

describe('useMapInteraction in a movement phase', () => {
  it("selects the player's unit, and a second click lets go", () => {
    const { r, clickUnit } = setup({ units: [A_PAR, A_BUR] });
    clickUnit(A_PAR);
    expect(r().selectedUnitId).toBe(A_PAR.id);
    expect(r().interaction.interactionMode).toBe('MOVE');
    expect(r().selection.reachableMap).toHaveProperty('BUR');
    clickUnit(A_PAR);
    expect(r().selectedUnitId).toBeNull();
  });

  it('orders a move to a reachable province, then lets go of the unit', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [A_PAR],
    });
    clickUnit(A_PAR);
    clickProvince('GAS');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(A_PAR, 'GAS', null, false),
    );
    expect(r().selectedUnitId).toBeNull();
  });

  it("orders a hold when the unit's own province is clicked", () => {
    const { clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [A_PAR],
    });
    clickUnit(A_PAR);
    clickProvince('PAR');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(holdOrder(A_PAR));
  });

  it('sends a coastal army by convoy where it cannot walk, if a fleet is at sea', () => {
    const { clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [A_BRE, F_MAO],
    });
    clickUnit(A_BRE);
    clickProvince('MAR');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(A_BRE, 'MAR', null, true),
    );
  });

  it("picks up another of the player's units from an unreachable province, and lets go on an empty one", () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [A_PAR, unitAt('FRANCE', 'A', 'MAR')],
    });
    clickUnit(A_PAR);
    clickProvince('MAR');
    expect(r().selectedUnitId).toBe('FRANCE_A_MAR');
    clickProvince('BRE');
    expect(r().selectedUnitId).toBeNull();
    expect(onUpdateOrder).not.toHaveBeenCalled();
  });

  it("moves onto a foreign unit's reachable province, but never selects the foreign unit", () => {
    const { r, clickUnit, onUpdateOrder } = setup({
      units: [A_PAR, A_PIC_GER, A_MAR_ITA],
    });
    clickUnit(A_PIC_GER);
    expect(r().selectedUnitId).toBeNull();
    clickUnit(A_PAR);
    clickUnit(A_PIC_GER);
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(A_PAR, 'PIC', null, false),
    );
    clickUnit(A_PAR);
    clickUnit(A_MAR_ITA);
    expect(r().selectedUnitId).toBeNull();
    expect(onUpdateOrder).toHaveBeenCalledTimes(1);
  });

  it("lets the sandbox pick up any power's unit", () => {
    const { r, clickUnit } = setup({
      units: [A_PAR, A_PIC_GER],
      sandboxMode: true,
    });
    clickUnit(A_PIC_GER);
    expect(r().selectedUnitId).toBe(A_PIC_GER.id);
  });

  it('supports a move: Support, the unit to support, then where it goes', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [A_PAR, A_BUR],
    });
    clickUnit(A_PAR);
    act(() => r().interaction.chooseSupport());
    expect(r().interaction.interactionMode).toBe('SUPPORT_PICK_UNIT');
    clickUnit(A_BUR);
    expect(r().interaction.interactionMode).toBe('SUPPORT_PICK_TARGET');
    expect(r().interaction.pendingAuxOrigin).toBe('BUR');
    clickProvince('MAR');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      supportOrder(A_PAR, 'BUR', 'MAR'),
    );
    expect(r().interaction.interactionMode).toBe('MOVE');
    expect(r().selectedUnitId).toBeNull();
  });

  it('supports a hold when the supported unit is clicked again', () => {
    const { r, clickUnit, onUpdateOrder } = setup({ units: [A_PAR, A_BUR] });
    clickUnit(A_PAR);
    act(() => r().interaction.chooseSupport());
    clickUnit(A_BUR);
    clickUnit(A_BUR);
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      supportOrder(A_PAR, 'BUR', 'BUR'),
    );
  });

  it('supports into an occupied province by clicking the unit standing there', () => {
    const { r, clickUnit, onUpdateOrder } = setup({
      units: [A_PAR, A_BUR, A_PIC_GER],
    });
    clickUnit(A_PAR);
    act(() => r().interaction.chooseSupport());
    clickUnit(A_BUR);
    clickUnit(A_PIC_GER);
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      supportOrder(A_PAR, 'BUR', 'PIC'),
    );
  });

  it('picks the supported unit by its province too, and gives up on an empty one', () => {
    const { r, clickUnit, clickProvince } = setup({ units: [A_PAR, A_BUR] });
    clickUnit(A_PAR);
    act(() => r().interaction.chooseSupport());
    clickProvince('BUR');
    expect(r().interaction.pendingAuxOrigin).toBe('BUR');

    clickUnit(A_PAR);
    clickUnit(A_PAR);
    act(() => r().interaction.chooseSupport());
    clickProvince('GAS');
    expect(r().selectedUnitId).toBeNull();
    expect(r().interaction.interactionMode).toBe('MOVE');
  });

  it('convoys: Convoy, the army, then the shore it lands on', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [F_MAO, A_BRE],
    });
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    expect(r().interaction.interactionMode).toBe('CONVOY_PICK_ARMY');
    clickUnit(A_BRE);
    expect(r().interaction.interactionMode).toBe('CONVOY_PICK_TARGET');
    clickProvince('SPA');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      convoyOrder(F_MAO, 'BRE', 'SPA'),
    );
  });

  it('only convoys armies: a fleet clicked while picking the army gives up', () => {
    const { r, clickUnit, clickProvince } = setup({ units: [F_MAO, F_GAS] });
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickProvince('GAS');
    expect(r().selectedUnitId).toBeNull();
    expect(r().interaction.interactionMode).toBe('MOVE');
  });

  it('refuses inland armies and refuses water, inland, or same-origin convoy destinations (#142)', () => {
    const A_SPA_ENG = unitAt('ENGLAND', 'A', 'SPA');
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [F_MAO, A_PAR, A_BRE, A_SPA_ENG],
    });

    // Inland army cannot be picked as convoy passenger (unit click or province click)
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickUnit(A_PAR);
    expect(r().selectedUnitId).toBeNull();
    expect(r().interaction.interactionMode).toBe('MOVE');

    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickProvince('PAR');
    expect(r().selectedUnitId).toBeNull();

    // Water tile cannot be picked as convoy destination
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickUnit(A_BRE);
    expect(r().interaction.interactionMode).toBe('CONVOY_PICK_TARGET');
    clickProvince('MAO');
    expect(onUpdateOrder).not.toHaveBeenCalled();
    expect(r().selectedUnitId).toBeNull();

    // Inland tile cannot be picked as convoy destination
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickUnit(A_BRE);
    clickProvince('PAR');
    expect(onUpdateOrder).not.toHaveBeenCalled();
    expect(r().selectedUnitId).toBeNull();

    // Same origin cannot be picked as convoy destination
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickUnit(A_BRE);
    clickProvince('BRE');
    expect(onUpdateOrder).not.toHaveBeenCalled();
    expect(r().selectedUnitId).toBeNull();

    // Occupied valid coastal province CAN be picked by clicking the unit standing there
    clickUnit(F_MAO);
    act(() => r().interaction.chooseConvoy());
    clickUnit(A_BRE);
    clickUnit(A_SPA_ENG);
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      convoyOrder(F_MAO, 'BRE', 'SPA'),
    );
  });

  it('asks a fleet which coast of a split-coast province, unless the click named one', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [F_MAO],
    });
    clickUnit(F_MAO);
    clickProvince('SPA');
    expect(r().interaction.pendingCoastChoice).toEqual({
      target: 'SPA',
      coasts: ['NC', 'SC'],
    });
    expect(onUpdateOrder).not.toHaveBeenCalled();
    act(() => r().interaction.cancelCoastChoice());
    expect(r().interaction.pendingCoastChoice).toBeNull();

    clickProvince('SPA', 'SC');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(F_MAO, 'SPA', 'SC', false),
    );
  });

  it("fills in a fleet's only coast without asking", () => {
    const { clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [F_GAS],
    });
    clickUnit(F_GAS);
    clickProvince('SPA');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(F_GAS, 'SPA', 'NC', false),
    );
  });

  it('commits a coast picked from the picker', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      units: [F_MAO],
    });
    clickUnit(F_MAO);
    clickProvince('SPA');
    act(() => r().interaction.commitMoveOrRetreatOrder(F_MAO, 'SPA', 'NC'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      moveOrder(F_MAO, 'SPA', 'NC', false),
    );
    expect(r().interaction.pendingCoastChoice).toBeNull();
  });

  it('remembers Move for this unit only, and lets go back to Move mode', () => {
    const { r, clickUnit } = setup({ units: [A_PAR, A_BUR] });
    clickUnit(A_PAR);
    // Move abandons a half-picked support.
    act(() => r().interaction.chooseSupport());
    clickUnit(A_BUR);
    act(() => r().interaction.chooseMove());
    expect(r().interaction.interactionMode).toBe('MOVE');
    expect(r().interaction.pendingAuxOrigin).toBeNull();
    expect(r().interaction.moveModeChosen).toBe(true);
    clickUnit(A_BUR);
    expect(r().interaction.moveModeChosen).toBe(false);

    act(() => r().interaction.chooseSupport());
    act(() => r().interaction.clearSelection());
    expect(r().interaction.interactionMode).toBe('MOVE');
    expect(r().interaction.pendingAuxOrigin).toBeNull();
    expect(r().selectedUnitId).toBeNull();
  });

  it('ignores the click that ends a drag', () => {
    const { r, clickUnit, clickProvince, dragMovedRef } = setup({
      units: [A_PAR],
    });
    dragMovedRef.current = true;
    clickUnit(A_PAR);
    clickProvince('PAR');
    expect(r().selectedUnitId).toBeNull();
  });

  it('lights the hovered province, but not while the map is being panned', () => {
    const { r, isPanningRef } = setup({ units: [A_PAR] });
    act(() => r().interaction.onHoverProvince('BUR'));
    expect(r().interaction.hoveredProv).toBe('BUR');
    isPanningRef.current = true;
    act(() => r().interaction.onHoverProvince('GAS'));
    expect(r().interaction.hoveredProv).toBe('BUR');
  });
});

describe('useMapInteraction in a retreat phase', () => {
  const A_PAR_OUT = unitAt('FRANCE', 'A', 'PAR', { is_dislodged: true });
  const A_PAR_IN = unitAt('GERMANY', 'A', 'PAR');
  const F_BRE_OUT = unitAt('FRANCE', 'F', 'BRE', { is_dislodged: true });
  const retreats = {
    FRANCE: { 'A PAR': ['GAS', 'PIC'], 'F BRE': ['SPA/NC'] },
  } as unknown as Record<Power, Record<string, string[]>>;

  it('picks the dislodged unit, even through the unit that dislodged it, and retreats it', () => {
    const { r, clickUnit, clickProvince, onUpdateOrder } = setup({
      phase: 'Retreats',
      units: [A_PAR_OUT, A_PAR_IN],
      retreats,
    });
    clickUnit(A_PAR_IN);
    expect(r().selectedUnitId).toBe(A_PAR_OUT.id);
    clickProvince('GAS');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      retreatOrder(A_PAR_OUT, 'GAS', null),
    );
  });

  it("fills in a fleet's only retreat coast", () => {
    const { clickProvince, onUpdateOrder } = setup({
      phase: 'Retreats',
      units: [F_BRE_OUT],
      retreats,
    });
    clickProvince('BRE');
    clickProvince('SPA');
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      retreatOrder(F_BRE_OUT, 'SPA', 'NC'),
    );
  });

  it('only commands dislodged units', () => {
    const { r } = setup({
      phase: 'Retreats',
      units: [A_PAR_OUT, A_BUR],
      retreats,
    });
    act(() => r().setSelectedUnitId(A_BUR.id));
    expect(r().selection.selectedUnit).toBeNull();
    act(() => r().setSelectedUnitId(A_PAR_OUT.id));
    expect(r().selection.selectedUnit).toBe(A_PAR_OUT);
  });
});

describe('useMapInteraction in a winter adjustment', () => {
  it('selects a build slot from its home centre, and lets go on a second click', () => {
    const { r, clickProvince } = setup({
      phase: 'Adjustments',
      units: [A_BUR],
      builds: { FRANCE: { count: 1, homes: ['PAR'] } } as Record<
        Power,
        { count: number; homes: string[] }
      >,
      buildHomes: { PAR: 'FRANCE' },
    });
    clickProvince('PAR');
    expect(r().selectedUnitId).toBe('BUILD_FRANCE_PAR');
    expect(r().selection.selectedBuildProv).toBe('PAR');
    clickProvince('PAR');
    expect(r().selectedUnitId).toBeNull();
  });

  it('picks a unit to disband only when the power is short of centres', () => {
    const builds = (count: number) =>
      ({ FRANCE: { count, homes: [] } }) as unknown as Record<
        Power,
        { count: number; homes: string[] }
      >;
    const short = setup({
      phase: 'Adjustments',
      units: [A_BUR],
      builds: builds(-1),
    });
    short.clickUnit(A_BUR);
    expect(short.r().selectedUnitId).toBe(A_BUR.id);

    const even = setup({
      phase: 'Adjustments',
      units: [A_BUR],
      builds: builds(0),
    });
    even.clickUnit(A_BUR);
    even.clickProvince('BUR');
    expect(even.r().selectedUnitId).toBeNull();
  });
});

describe('useMapSelection', () => {
  it('commands nothing on a past turn, even in the sandbox', () => {
    const { r } = setup({
      units: [A_PAR],
      sandboxMode: true,
      historyView: true,
    });
    act(() => r().setSelectedUnitId(A_PAR.id));
    expect(r().selection.selectedUnit).toBeNull();
    expect(r().selection.canEditAnyPower).toBe(false);
    expect(r().selection.controlPower).toBeNull();
  });
});
