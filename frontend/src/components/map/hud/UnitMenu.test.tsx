// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, orderFor, unitAt } from '../../../test/mapFixtures';
import type { Order, ProvinceInfo, Unit } from '../../../types/diplomacy';
import { disbandOrder, holdOrder } from '../../../utils/orderBuilders';
import type { MapInteractionMode } from '../hooks/useMapInteraction';
import { UnitMenu } from './UnitMenu';

const PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  MAO: {
    ...FRANCE_PROVINCES.BRE,
    id: 'MAO',
    name: 'Mid-Atlantic Ocean',
    type: 'SEA',
  },
};
const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const F_MAO = unitAt('FRANCE', 'F', 'MAO');
const F_BRE = unitAt('FRANCE', 'F', 'BRE');

interface Options {
  unit?: Unit;
  order?: Order;
  phase?: 'Movement' | 'Retreats' | 'Adjustments';
  mode?: MapInteractionMode;
  moveModeChosen?: boolean;
  pendingAuxOrigin?: string | null;
  compact?: boolean;
}

function setup({
  unit = A_PAR,
  order,
  phase = 'Movement',
  mode = 'MOVE',
  moveModeChosen = false,
  pendingAuxOrigin = null,
  compact = false,
}: Options = {}) {
  const interaction = {
    interactionMode: mode,
    moveModeChosen,
    pendingAuxOrigin,
    clearSelection: vi.fn(),
    chooseMove: vi.fn(),
    chooseRetreat: vi.fn(),
    chooseSupport: vi.fn(),
    chooseConvoy: vi.fn(),
  };
  const onUpdateOrder = vi.fn();
  render(
    <UnitMenu
      compact={compact}
      placement={{
        menuRef: null,
        docked: false,
        floatingStyle: { left: 40, top: 80 },
        dragHeaderProps: {},
      }}
      provinces={PROVINCES}
      unit={unit}
      order={order}
      isRetreatPhase={phase === 'Retreats'}
      isAdjustmentPhase={phase === 'Adjustments'}
      interaction={interaction}
      onUpdateOrder={onUpdateOrder}
    />,
  );
  return { interaction, onUpdateOrder, user: userEvent.setup() };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('UnitMenu in a movement phase', () => {
  it('names the unit and offers Move, Hold and Support', () => {
    setup();
    expect(screen.getByText('Army Paris')).toBeInTheDocument();
    for (const name of ['Move', 'Hold', 'Support']) {
      expect(button(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Convoy' })).toBeNull();
  });

  it('offers Convoy only to a fleet at sea', () => {
    setup({ unit: F_MAO });
    expect(button('Convoy')).toBeInTheDocument();
  });

  it('does not offer Convoy to a fleet in port', () => {
    setup({ unit: F_BRE });
    expect(screen.queryByRole('button', { name: 'Convoy' })).toBeNull();
  });

  it('orders a hold and closes', async () => {
    const { interaction, onUpdateOrder, user } = setup();
    await user.click(button('Hold'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(holdOrder(A_PAR));
    expect(interaction.clearSelection).toHaveBeenCalledOnce();
  });

  it('hands Move, Support and Convoy to the click state machine', async () => {
    const { interaction, onUpdateOrder, user } = setup({ unit: F_MAO });
    await user.click(button('Move'));
    await user.click(button('Support'));
    await user.click(button('Convoy'));
    expect(interaction.chooseMove).toHaveBeenCalledOnce();
    expect(interaction.chooseSupport).toHaveBeenCalledOnce();
    expect(interaction.chooseConvoy).toHaveBeenCalledOnce();
    expect(onUpdateOrder).not.toHaveBeenCalled();
  });

  it('lights a saved hold until Move is pressed', () => {
    setup({ order: orderFor(A_PAR, 'HOLD') });
    expect(button('Hold')).toHaveAttribute('data-state', 'hold');
    expect(button('Move')).not.toHaveAttribute('data-state', 'active');
  });

  it('lights Move once it is pressed, over a saved hold', () => {
    setup({ order: orderFor(A_PAR, 'HOLD'), moveModeChosen: true });
    expect(button('Move')).toHaveAttribute('data-state', 'active');
    expect(button('Hold')).not.toHaveAttribute('data-state', 'hold');
  });

  it.each([
    [
      'MOVE',
      null,
      false,
      'Click a green province to Move • Drag header to move',
    ],
    ['MOVE', null, true, 'Tap a green province to Move'],
    ['SUPPORT_PICK_UNIT', null, false, 'Step 1/2: Click unit to Support'],
    [
      'SUPPORT_PICK_TARGET',
      'BUR',
      true,
      'Step 2/2: Tap destination for BUR (or tap BUR to Hold)',
    ],
    [
      'CONVOY_PICK_ARMY',
      null,
      false,
      'Step 1/2: Click coastal Army to Convoy (green = adjacent shore, blue = via fleet chain)',
    ],
    [
      'CONVOY_PICK_TARGET',
      'BRE',
      true,
      'Step 2/2: Tap destination coast (green = direct / ready, blue = multi-ship chain)',
    ],
  ] as const)('in %s mode says what to do next', (mode, aux, compact, hint) => {
    setup({ mode, pendingAuxOrigin: aux, compact });
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('says Cancel on its close button on a phone', () => {
    setup({ compact: true });
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});

describe('UnitMenu in a retreat phase', () => {
  const OUT = unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true });

  it('names the dislodged unit and offers Retreat or Disband', () => {
    setup({ unit: OUT, phase: 'Retreats' });
    expect(screen.getByText('Dislodged Army Burgundy')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Click a green province on the map to Retreat, or click Disband',
      ),
    ).toBeInTheDocument();
  });

  it('disbands, or hands Retreat to the click state machine', async () => {
    const { interaction, onUpdateOrder, user } = setup({
      unit: OUT,
      phase: 'Retreats',
    });
    await user.click(button('Retreat'));
    expect(interaction.chooseRetreat).toHaveBeenCalledOnce();
    await user.click(button('Disband'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(disbandOrder(OUT));
    expect(interaction.clearSelection).toHaveBeenCalledOnce();
  });

  it('lights the order the unit has', () => {
    setup({
      unit: OUT,
      phase: 'Retreats',
      order: orderFor(OUT, 'RETREAT', { target: 'GAS' }),
    });
    expect(button('Retreat')).toHaveAttribute('data-state', 'active');
    expect(button('Disband')).not.toHaveAttribute('data-state', 'active');
  });
});

describe('UnitMenu in a winter adjustment', () => {
  it('keeps the unit with a hold, or disbands it', async () => {
    const { onUpdateOrder, user } = setup({ phase: 'Adjustments' });
    await user.click(button('Keep Unit'));
    expect(onUpdateOrder).toHaveBeenLastCalledWith(holdOrder(A_PAR));
    await user.click(button('Disband'));
    expect(onUpdateOrder).toHaveBeenLastCalledWith(disbandOrder(A_PAR));
  });

  it('lights Keep unless the unit is being disbanded', () => {
    setup({ phase: 'Adjustments', order: orderFor(A_PAR, 'DISBAND') });
    expect(button('Disband')).toHaveAttribute('data-state', 'active');
    expect(button('Keep Unit')).not.toHaveAttribute('data-state', 'hold');
  });
});
