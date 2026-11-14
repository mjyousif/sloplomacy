// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES } from '../../../test/mapFixtures';
import { CoastPicker } from './CoastPicker';

const PROVINCES = {
  ...FRANCE_PROVINCES,
  SPA: {
    ...FRANCE_PROVINCES.GAS,
    id: 'SPA',
    name: 'Spain',
    coasts: ['NC', 'SC'],
  },
};

describe('CoastPicker', () => {
  it('asks which coast, and passes the pick on', async () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    render(
      <CoastPicker
        compact={false}
        dockRef={null}
        provinces={PROVINCES}
        choice={{ target: 'SPA', coasts: ['NC', 'SC'] }}
        onPick={onPick}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Select Coast for Spain:')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'SPA/SC Coast' }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith('SC');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps its clicks from reaching the map under it', () => {
    const onMapClick = vi.fn();
    const onMapMouseDown = vi.fn();
    render(
      <div onClick={onMapClick} onMouseDown={onMapMouseDown}>
        <CoastPicker
          compact={false}
          dockRef={null}
          provinces={PROVINCES}
          choice={{ target: 'SPA', coasts: ['NC', 'SC'] }}
          onPick={() => {}}
          onCancel={() => {}}
        />
      </div>,
    );
    const title = screen.getByText('Select Coast for Spain:');
    fireEvent.mouseDown(title);
    fireEvent.click(title);
    expect(onMapClick).not.toHaveBeenCalled();
    expect(onMapMouseDown).not.toHaveBeenCalled();
  });

  it('docks as the bottom bar on a phone', () => {
    const dockRef = vi.fn();
    const { container } = render(
      <CoastPicker
        compact
        dockRef={dockRef}
        provinces={PROVINCES}
        choice={{ target: 'SPA', coasts: ['NC', 'SC'] }}
        onPick={() => {}}
        onCancel={() => {}}
      />,
    );
    const bar = container.querySelector('[data-testid="coast-picker"]');
    expect(bar).toHaveAttribute('data-docked', 'true');
    expect(dockRef).toHaveBeenCalledWith(bar);
  });
});
