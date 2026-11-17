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
  it('draws every land province and outlines every sea, named for a screen reader', () => {
    render(<MiniMap board={BOARD} label="Board of Vienna" />);
    const map = screen.getByRole('img', { name: 'Board of Vienna' });
    expect(map).toHaveAttribute('data-has-board', 'true');
    expect(
      map.querySelectorAll('[data-province-id]:not([data-sea])'),
    ).toHaveLength(56);
    expect(map.querySelectorAll('[data-sea="true"]')).toHaveLength(19);
    expect(province('PAR')).not.toHaveAttribute('data-sea');
    expect(province('NTH')).toHaveAttribute('data-sea', 'true');
    expect(province('MAO')).toHaveAttribute('data-sea', 'true');
  });

  it('draws land nobody can enter, Switzerland included, apart from neutral land', () => {
    render(<MiniMap board={BOARD} label="Board" />);
    const map = screen.getByTestId('mini-map');
    const ids = [...map.querySelectorAll('[data-impassable-id]')].map((el) =>
      el.getAttribute('data-impassable-id'),
    );
    expect(ids).toEqual(
      expect.arrayContaining(['iceland', 'ireland', 'swiss', 'cyprus']),
    );
    // Switzerland is not also drawn as a parchment province.
    expect(province('SWI')).toBeNull();
    // They share one flat fill, which is not the neutral parchment of a playable province.
    expect(map.querySelectorAll('pattern')).toHaveLength(0);
    expect(map.querySelectorAll('[fill^="url("]')).toHaveLength(0);
  });

  it('lays the board stripes over impassable land only when asked', () => {
    render(<MiniMap board={BOARD} stripedLand label="Board" />);
    const map = screen.getByTestId('mini-map');
    expect(map.querySelectorAll('pattern')).toHaveLength(1);
    const patternId = map.querySelector('pattern')?.getAttribute('id');
    const striped = map.querySelectorAll(`[fill="url(#${patternId})"]`);
    expect(striped.length).toBeGreaterThan(0);
    expect(striped).toHaveLength(
      map.querySelectorAll('[data-impassable-id]').length / 2,
    );
  });

  it('draws the seas under the land and never gives one an owner', () => {
    render(<MiniMap board={BOARD} label="Board" />);
    const ids = [
      ...screen.getByTestId('mini-map').querySelectorAll('[data-province-id]'),
    ];
    const lastSea = ids
      .map((el) => el.hasAttribute('data-sea'))
      .lastIndexOf(true);
    const firstLand = ids.findIndex((el) => !el.hasAttribute('data-sea'));
    expect(lastSea).toBeLessThan(firstLand);
    expect(province('NTH')).not.toHaveAttribute('data-owner');
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

  it('draws a circle per army and a pentagon per fleet, and rings the viewer own units', () => {
    render(<MiniMap board={BOARD} viewerPower="FRANCE" label="Board" />);
    const units = screen.getAllByTestId('mini-map-unit');
    expect(units.map((u) => u.tagName.toLowerCase())).toEqual([
      'circle',
      'polygon',
      'circle',
    ]);
    // A pentagon has five points, and no unit carries a letter or an icon.
    expect(units[1].getAttribute('points')?.split(' ')).toHaveLength(5);
    expect(units.every((u) => u.textContent === '')).toBe(true);
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
