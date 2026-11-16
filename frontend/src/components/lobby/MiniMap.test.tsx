// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BoardPreview } from '../../types/diplomacy';
import { MiniMap } from './MiniMap';

const BOARD: BoardPreview = {
  ownership: { PAR: 'FRANCE', BUR: 'FRANCE', MUN: 'GERMANY' },
  units: [
    { power: 'FRANCE', unit_type: 'A', province: 'PAR' },
    { power: 'FRANCE', unit_type: 'F', province: 'BRE' },
    { power: 'GERMANY', unit_type: 'A', province: 'MUN' },
  ],
};

const province = (id: string) =>
  screen.getByTestId('mini-map').querySelector(`[data-province-id="${id}"]`);

describe('MiniMap', () => {
  it('draws every land province and no sea, named for a screen reader', () => {
    render(<MiniMap board={BOARD} label="Board of Vienna" />);
    const map = screen.getByRole('img', { name: 'Board of Vienna' });
    expect(map).toHaveAttribute('data-has-board', 'true');
    expect(map.querySelectorAll('[data-province-id]')).toHaveLength(57);
    expect(province('PAR')).not.toBeNull();
    expect(province('NTH')).toBeNull();
    expect(province('MAO')).toBeNull();
  });

  it('colours a province by its owner and leaves the rest parchment', () => {
    render(<MiniMap board={BOARD} label="Board" />);
    expect(province('PAR')).toHaveAttribute('data-owner', 'FRANCE');
    expect(province('MUN')).toHaveAttribute('data-owner', 'GERMANY');
    expect(province('SPA')).not.toHaveAttribute('data-owner');
    const fill = (id: string) => province(id)?.getAttribute('fill');
    expect(fill('PAR')).toBe(fill('BUR'));
    expect(fill('PAR')).not.toBe(fill('MUN'));
    expect(fill('PAR')).not.toBe(fill('SPA'));
    expect(fill('SPA')).toBe(fill('POR'));
  });

  it('draws a disc per army and a square per fleet, and rings the viewer own units', () => {
    render(<MiniMap board={BOARD} viewerPower="FRANCE" label="Board" />);
    const units = screen.getAllByTestId('mini-map-unit');
    expect(units.map((u) => u.tagName.toLowerCase())).toEqual([
      'circle',
      'rect',
      'circle',
    ]);
    expect(units.map((u) => u.getAttribute('data-mine'))).toEqual([
      'true',
      'true',
      null,
    ]);
  });

  it('rings no unit when the viewer holds no seat', () => {
    render(<MiniMap board={BOARD} label="Board" />);
    expect(
      screen
        .getAllByTestId('mini-map-unit')
        .every((u) => !u.hasAttribute('data-mine')),
    ).toBe(true);
  });

  it('leaves the units off a thumbnail', () => {
    render(<MiniMap board={BOARD} showUnits={false} label="Board" />);
    expect(screen.queryByTestId('mini-map-unit')).toBeNull();
    expect(province('PAR')).toHaveAttribute('data-owner', 'FRANCE');
  });

  it('draws the bare map when a game has no board yet', () => {
    render(<MiniMap board={null} label="Board" />);
    const map = screen.getByTestId('mini-map');
    expect(map).toHaveAttribute('data-has-board', 'false');
    expect(map.querySelectorAll('[data-owner]')).toHaveLength(0);
    expect(screen.queryByTestId('mini-map-unit')).toBeNull();
  });

  it('skips a unit in a province the map does not know', () => {
    render(
      <MiniMap
        board={{
          ownership: {},
          units: [{ power: 'ITALY', unit_type: 'A', province: 'XXX' }],
        }}
        label="Board"
      />,
    );
    expect(screen.queryByTestId('mini-map-unit')).toBeNull();
  });
});
