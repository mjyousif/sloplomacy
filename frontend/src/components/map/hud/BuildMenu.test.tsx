// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES } from '../../../test/mapFixtures';
import type { Order, ProvinceInfo } from '../../../types/diplomacy';
import { buildOrder, waiveOrder } from '../../../utils/orderBuilders';
import { BuildMenu } from './BuildMenu';

const PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  STP: {
    ...FRANCE_PROVINCES.BRE,
    id: 'STP',
    name: 'St. Petersburg',
    home_power: 'RUSSIA',
    coasts: ['NC', 'SC'],
  },
};

function setup(home: string, order?: Order, compact = false) {
  const onUpdateOrder = vi.fn();
  const onClose = vi.fn();
  const power = home === 'STP' ? 'RUSSIA' : 'FRANCE';
  const slotId = `BUILD_${power}_${home}`;
  render(
    <BuildMenu
      compact={compact}
      placement={{
        menuRef: null,
        docked: false,
        floatingStyle: { left: 40, top: 80 },
        dragHeaderProps: {},
      }}
      provinces={PROVINCES}
      slotId={slotId}
      home={home}
      order={order}
      power={power}
      onUpdateOrder={onUpdateOrder}
      onClose={onClose}
    />,
  );
  return { onUpdateOrder, onClose, slotId, power, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('BuildMenu', () => {
  it('builds only an army in an inland home', async () => {
    const { onUpdateOrder, onClose, slotId, user } = setup('PAR');
    expect(screen.getByText('Build in Paris')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fleet|\+ F/ })).toBeNull();
    await user.click(button('+ Army'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      buildOrder(slotId, 'FRANCE', 'PAR', 'A', null),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('builds a fleet in a coastal home', async () => {
    const { onUpdateOrder, slotId, user } = setup('BRE');
    await user.click(button('+ Fleet'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      buildOrder(slotId, 'FRANCE', 'BRE', 'F', null),
    );
  });

  it('offers a fleet on each coast of a split-coast home', async () => {
    const { onUpdateOrder, slotId, user } = setup('STP');
    expect(screen.queryByRole('button', { name: '+ Fleet' })).toBeNull();
    await user.click(button('+ F (NC)'));
    expect(onUpdateOrder).toHaveBeenLastCalledWith(
      buildOrder(slotId, 'RUSSIA', 'STP', 'F', 'NC'),
    );
    await user.click(button('+ F (SC)'));
    expect(onUpdateOrder).toHaveBeenLastCalledWith(
      buildOrder(slotId, 'RUSSIA', 'STP', 'F', 'SC'),
    );
  });

  it('waives the build', async () => {
    const { onUpdateOrder, slotId, user } = setup('BRE');
    await user.click(button('Waive'));
    expect(onUpdateOrder).toHaveBeenCalledExactlyOnceWith(
      waiveOrder(slotId, 'FRANCE', 'BRE'),
    );
  });

  it("lights the slot's current choice", () => {
    setup('STP', buildOrder('BUILD_RUSSIA_STP', 'RUSSIA', 'STP', 'F', 'SC'));
    expect(button('+ F (SC)')).toHaveAttribute('data-state', 'hold');
    expect(button('+ F (NC)')).not.toHaveAttribute('data-state', 'hold');
    expect(button('+ Army')).not.toHaveAttribute('data-state', 'hold');
  });

  it('lights Waive when the build is waived', () => {
    setup('PAR', waiveOrder('BUILD_FRANCE_PAR', 'FRANCE', 'PAR'));
    expect(button('Waive')).toHaveAttribute('data-state', 'active');
  });

  it('closes without ordering, and says Cancel on a phone', async () => {
    const wide = setup('PAR');
    await wide.user.click(screen.getByTitle('Close (Esc)'));
    expect(wide.onClose).toHaveBeenCalledOnce();
    expect(wide.onUpdateOrder).not.toHaveBeenCalled();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('labels the close button Cancel on a phone', () => {
    setup('PAR', undefined, true);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
