// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MACRO_PROVINCES } from '../../../test/macroFixtures';
import { unitAt } from '../../../test/mapFixtures';
import { retreatOrder } from '../../../utils/orderBuilders';
import { RetreatControls } from './RetreatControls';

const ARMY = unitAt('FRANCE', 'A', 'PAR', { is_dislodged: true });
const FLEET = unitAt('FRANCE', 'F', 'BRE', { is_dislodged: true });

describe('RetreatControls', () => {
  it('lists the valid retreats and shows the chosen one', () => {
    render(
      <RetreatControls
        unit={ARMY}
        order={retreatOrder(ARMY, 'BUR', null)}
        provinces={MACRO_PROVINCES}
        validRetreats={[
          { province: 'BUR', coasts: [] },
          { province: 'GAS', coasts: [] },
        ]}
        onUpdateOrder={vi.fn()}
      />,
    );
    const select = screen.getByTestId(
      'select-retreat-target',
    ) as HTMLSelectElement;
    expect(select.value).toBe('BUR');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Burgundy (BUR)',
      'Gascony (GAS)',
    ]);
  });

  it('sends an explicit retreat to the picked province, with its coast', () => {
    const onUpdateOrder = vi.fn();
    const order = retreatOrder(FLEET, 'GAS', null);
    render(
      <RetreatControls
        unit={FLEET}
        order={order}
        provinces={MACRO_PROVINCES}
        validRetreats={[
          { province: 'GAS', coasts: [] },
          { province: 'MAR', coasts: ['NC', 'SC'] },
        ]}
        onUpdateOrder={onUpdateOrder}
      />,
    );
    const select = screen.getByTestId(
      'select-retreat-target',
    ) as HTMLSelectElement;
    // A fleet gets one option per coast.
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'GAS',
      'MAR/NC',
      'MAR/SC',
    ]);
    fireEvent.change(select, { target: { value: 'MAR/SC' } });
    expect(onUpdateOrder).toHaveBeenCalledWith({
      ...order,
      target: 'MAR',
      target_coast: 'SC',
      is_explicit: true,
    });
    fireEvent.change(select, { target: { value: 'GAS' } });
    expect(onUpdateOrder).toHaveBeenLastCalledWith({
      ...order,
      target: 'GAS',
      target_coast: null,
      is_explicit: true,
    });
  });

  it('selects the coast the order already has', () => {
    render(
      <RetreatControls
        unit={FLEET}
        order={retreatOrder(FLEET, 'MAR', 'SC')}
        provinces={MACRO_PROVINCES}
        validRetreats={[{ province: 'MAR', coasts: ['NC', 'SC'] }]}
        onUpdateOrder={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId('select-retreat-target') as HTMLSelectElement).value,
    ).toBe('MAR/SC');
  });

  it('gives an army one option for a coastal province, whatever its coasts', () => {
    render(
      <RetreatControls
        unit={ARMY}
        order={retreatOrder(ARMY, 'MAR', null)}
        provinces={MACRO_PROVINCES}
        validRetreats={[{ province: 'MAR', coasts: ['NC', 'SC'] }]}
        onUpdateOrder={vi.fn()}
      />,
    );
    const select = screen.getByTestId(
      'select-retreat-target',
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['MAR']);
  });

  it('says the unit must disband when there is nowhere to go', () => {
    render(
      <RetreatControls
        unit={ARMY}
        order={retreatOrder(ARMY, 'BUR', null)}
        provinces={MACRO_PROVINCES}
        validRetreats={[]}
        onUpdateOrder={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('select-retreat-target')).toBeNull();
    expect(
      screen.getByText('No valid retreat provinces available (Must Disband)'),
    ).toBeInTheDocument();
  });
});
