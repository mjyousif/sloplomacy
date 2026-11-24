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
  it('lists the valid retreats and selects via custom dropdown on desktop with hover preview', () => {
    const onUpdateOrder = vi.fn();
    const onHoverProvince = vi.fn();
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
        compact
        onUpdateOrder={onUpdateOrder}
        onHoverProvince={onHoverProvince}
      />,
    );

    const trigger = screen.getByTestId('select-retreat-target');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('data-compact', 'true');
    expect(trigger).toHaveTextContent('Gascony');

    fireEvent.click(trigger);
    const marSc = screen.getByRole('option', { name: 'Marseilles (SC)' });
    fireEvent.pointerEnter(marSc, { pointerType: 'mouse' });
    expect(onHoverProvince).toHaveBeenLastCalledWith('MAR');

    fireEvent.click(marSc);
    expect(onUpdateOrder).toHaveBeenCalledWith({
      ...order,
      target: 'MAR',
      target_coast: 'SC',
      is_explicit: true,
    });
  });

  it('renders native select when useNativeSelect is true and handles coast changes', () => {
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
        compact
        useNativeSelect
        onUpdateOrder={onUpdateOrder}
      />,
    );
    const select = screen.getByTestId(
      'select-retreat-target',
    ) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveAttribute('data-compact', 'true');
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
        useNativeSelect
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
        useNativeSelect
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
    expect(screen.getByText('Must Disband')).toBeInTheDocument();
  });
});
