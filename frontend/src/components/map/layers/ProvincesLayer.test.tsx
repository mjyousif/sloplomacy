// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getMapLayout } from '../../../data/mapLayouts';
import { FRANCE_PROVINCES, unitAt } from '../../../test/mapFixtures';
import type { ProvinceInfo } from '../../../types/diplomacy';
import { ProvincesLayer } from './ProvincesLayer';

const PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  SWI: {
    ...FRANCE_PROVINCES.BUR,
    id: 'SWI',
    name: 'Switzerland',
    type: 'IMPASSABLE',
  },
};

function draw(
  extra: Partial<React.ComponentProps<typeof ProvincesLayer>> = {},
) {
  const onClickProvince = vi.fn();
  const onHoverProvince = vi.fn();
  const { container } = render(
    <svg>
      <ProvincesLayer
        provinces={PROVINCES}
        ownership={{}}
        layout={getMapLayout('classic')}
        isAdjustmentPhase={false}
        buildHomes={{}}
        selectedUnit={null}
        selectedBuildProv={null}
        reachableMap={{}}
        interactionMode="MOVE"
        hoveredProv={null}
        highlightedProvinces={[]}
        issuesByProvince={{}}
        onClickProvince={onClickProvince}
        onHoverProvince={onHoverProvince}
        {...extra}
      />
    </svg>,
  );
  const ids = (testId: string) =>
    Array.from(
      container.querySelectorAll<SVGElement>(`[data-testid="${testId}"]`),
    )
      .map((el) => el.dataset.provinceId)
      .sort();
  return { container, ids, onClickProvince, onHoverProvince };
}

describe('ProvincesLayer', () => {
  it('draws every known province but Switzerland, and passes clicks on', () => {
    const { container, ids, onClickProvince } = draw();
    expect(ids('province-path')).toEqual(Object.keys(FRANCE_PROVINCES).sort());
    fireEvent.click(
      container.querySelector(
        '[data-testid="province-path"][data-province-id="BUR"]',
      )!,
    );
    expect(onClickProvince).toHaveBeenCalledWith('BUR');
  });

  it('puts a reticle on each province the selected unit can move to', () => {
    const { ids } = draw({
      selectedUnit: unitAt('FRANCE', 'A', 'PAR'),
      reachableMap: { BUR: [], PIC: [] },
    });
    expect(ids('reachable-reticle')).toEqual(['BUR', 'PIC']);
  });

  it('drops the reticles while a support or convoy is being picked', () => {
    const { ids } = draw({
      selectedUnit: unitAt('FRANCE', 'A', 'PAR'),
      reachableMap: { BUR: [] },
      interactionMode: 'SUPPORT_PICK_UNIT',
    });
    expect(ids('reachable-reticle')).toEqual([]);
  });

  it('offers a fleet a selector for each coast it can reach, and passes the pick on', () => {
    const spain = {
      ...FRANCE_PROVINCES.GAS,
      id: 'SPA',
      name: 'Spain',
      coasts: ['NC', 'SC'],
    };
    const fleet = unitAt('FRANCE', 'F', 'GAS');
    const { container, onClickProvince } = draw({
      provinces: { ...PROVINCES, SPA: spain },
      selectedUnit: fleet,
      reachableMap: { SPA: ['NC'] },
    });
    const selectors = Array.from(
      container.querySelectorAll<SVGElement>(
        '[data-testid="province-coast-selector"]',
      ),
    );
    expect(selectors.map((el) => el.dataset.coast)).toEqual(['NC']);
    fireEvent.click(selectors[0]);
    expect(onClickProvince).toHaveBeenCalledWith('SPA', 'NC');

    // An army sees no coasts.
    const army = draw({
      provinces: { ...PROVINCES, SPA: spain },
      selectedUnit: unitAt('FRANCE', 'A', 'GAS'),
      reachableMap: { SPA: [] },
    });
    expect(
      army.container.querySelector('[data-testid="province-coast-selector"]'),
    ).toBeNull();
  });

  it('does not light sea tiles or split-coast selectors while picking a convoy or support (#142)', () => {
    const mao: ProvinceInfo = {
      ...FRANCE_PROVINCES.BRE,
      id: 'MAO',
      name: 'Mid-Atlantic Ocean',
      type: 'SEA',
      is_supply_center: false,
      home_power: null,
    };
    const spain: ProvinceInfo = {
      ...FRANCE_PROVINCES.GAS,
      id: 'SPA',
      name: 'Spain',
      coasts: ['NC', 'SC'],
    };
    const fleet = unitAt('FRANCE', 'F', 'BRE');
    const provincesWithSeaAndSpain = { ...PROVINCES, MAO: mao, SPA: spain };

    for (const mode of [
      'CONVOY_PICK_ARMY',
      'CONVOY_PICK_TARGET',
      'SUPPORT_PICK_UNIT',
      'SUPPORT_PICK_TARGET',
    ] as const) {
      const { container } = draw({
        provinces: provincesWithSeaAndSpain,
        selectedUnit: fleet,
        reachableMap: { MAO: [], SPA: ['NC', 'SC'] },
        interactionMode: mode,
      });
      const maoPath = container.querySelector(
        '[data-testid="province-path"][data-province-id="MAO"]',
      );
      expect(maoPath?.getAttribute('fill')).toBe('#9ec5d6');
      expect(maoPath?.getAttribute('stroke')).toBe('none');
      expect(
        container.querySelector('[data-testid="province-coast-selector"]'),
      ).toBeNull();
    }
  });

  it('highlights valid coastal armies and destination coasts in convoy modes without lighting sea or inland tiles', () => {
    const mao: ProvinceInfo = {
      ...FRANCE_PROVINCES.BRE,
      id: 'MAO',
      name: 'Mid-Atlantic Ocean',
      type: 'SEA',
      is_supply_center: false,
      home_power: null,
      fleet_adj: { '': ['BRE', 'GAS', 'SPA/NC', 'SPA/SC'] },
    };
    const spain: ProvinceInfo = {
      ...FRANCE_PROVINCES.GAS,
      id: 'SPA',
      name: 'Spain',
      coasts: ['NC', 'SC'],
      fleet_adj: { NC: ['MAO', 'GAS'], SC: ['MAO', 'MAR'] },
    };
    const provincesWithMaoAndSpa = { ...PROVINCES, MAO: mao, SPA: spain };
    const fMao = unitAt('FRANCE', 'F', 'MAO');
    const aBre = unitAt('FRANCE', 'A', 'BRE');
    const aPar = unitAt('FRANCE', 'A', 'PAR'); // inland
    const units = [fMao, aBre, aPar];

    const fillOf = (container: HTMLElement, provId: string) =>
      container
        .querySelector(
          `[data-testid="province-path"][data-province-id="${provId}"]`,
        )
        ?.getAttribute('fill');

    // Step 1: CONVOY_PICK_ARMY lights coastal army BRE, not inland PAR or sea MAO
    const step1 = draw({
      provinces: provincesWithMaoAndSpa,
      selectedUnit: fMao,
      reachableMap: { MAO: [], BRE: [], GAS: [], SPA: ['NC', 'SC'] },
      interactionMode: 'CONVOY_PICK_ARMY',
      units,
    });
    expect(fillOf(step1.container, 'BRE')).toBe('#4ade80');
    expect(fillOf(step1.container, 'PAR')).not.toBe('#4ade80');
    expect(fillOf(step1.container, 'MAO')).toBe('#9ec5d6');

    // Step 2: CONVOY_PICK_TARGET for A BRE lights destination coasts (GAS, SPA),
    // not origin BRE, inland PAR, or sea MAO, and shows no fleet coast selectors.
    const step2 = draw({
      provinces: provincesWithMaoAndSpa,
      selectedUnit: fMao,
      reachableMap: { MAO: [], BRE: [], GAS: [], SPA: ['NC', 'SC'] },
      interactionMode: 'CONVOY_PICK_TARGET',
      pendingAuxOrigin: 'BRE',
      units,
    });
    expect(fillOf(step2.container, 'GAS')).toBe('#4ade80');
    expect(fillOf(step2.container, 'SPA')).toBe('#4ade80');
    expect(fillOf(step2.container, 'BRE')).not.toBe('#4ade80');
    expect(fillOf(step2.container, 'PAR')).not.toBe('#4ade80');
    expect(fillOf(step2.container, 'MAO')).toBe('#9ec5d6');
    expect(
      step2.container.querySelector('[data-testid="province-coast-selector"]'),
    ).toBeNull();
  });

  it('highlights valid supportable units and targets in support modes without lighting sea tiles for armies', () => {
    const mao: ProvinceInfo = {
      ...FRANCE_PROVINCES.BRE,
      id: 'MAO',
      name: 'Mid-Atlantic Ocean',
      type: 'SEA',
      is_supply_center: false,
      home_power: null,
      fleet_adj: { '': ['BRE', 'GAS'] },
    };
    const provincesWithMao = {
      ...PROVINCES,
      MAO: mao,
      BRE: {
        ...FRANCE_PROVINCES.BRE,
        fleet_adj: { '': ['MAO', 'PIC', 'GAS'] },
      },
      GAS: {
        ...FRANCE_PROVINCES.GAS,
        fleet_adj: { '': ['MAO', 'BRE'] },
      },
    };
    const fBre = unitAt('FRANCE', 'F', 'BRE');
    const aGas = unitAt('FRANCE', 'A', 'GAS');
    const fPic = unitAt('FRANCE', 'F', 'PIC');
    const aMar = unitAt('FRANCE', 'A', 'MAR'); // cannot reach BRE/MAO/PIC/GAS
    const units = [fBre, aGas, fPic, aMar];

    const fillOf = (container: HTMLElement, provId: string) =>
      container
        .querySelector(
          `[data-testid="province-path"][data-province-id="${provId}"]`,
        )
        ?.getAttribute('fill');

    // Step 1: SUPPORT_PICK_UNIT lights PIC (direct hold) and GAS (can move to PIC? No, PAR can move to PIC), not MAR or empty MAO
    const aPar = unitAt('FRANCE', 'A', 'PAR'); // army_adj includes PIC
    const step1 = draw({
      provinces: provincesWithMao,
      selectedUnit: fBre,
      reachableMap: { MAO: [], PIC: [] },
      interactionMode: 'SUPPORT_PICK_UNIT',
      units: [fBre, aPar, fPic, aMar],
    });
    expect(fillOf(step1.container, 'PAR')).toBe('#4ade80');
    expect(fillOf(step1.container, 'PIC')).toBe('#4ade80');
    expect(fillOf(step1.container, 'MAR')).not.toBe('#4ade80');
    expect(fillOf(step1.container, 'MAO')).toBe('#9ec5d6');

    // Step 2: SUPPORT_PICK_TARGET for Army in GAS lights GAS (hold), NOT sea tile MAO
    const step2Army = draw({
      provinces: provincesWithMao,
      selectedUnit: fBre,
      reachableMap: { MAO: [], PIC: [], GAS: [] },
      interactionMode: 'SUPPORT_PICK_TARGET',
      pendingAuxOrigin: 'GAS',
      units,
    });
    expect(fillOf(step2Army.container, 'GAS')).toBe('#4ade80');
    expect(fillOf(step2Army.container, 'MAO')).toBe('#9ec5d6');

    // Step 2: SUPPORT_PICK_TARGET for Fleet in GAS DOES light MAO (a fleet can move to MAO)
    const fGas = unitAt('FRANCE', 'F', 'GAS');
    const step2Fleet = draw({
      provinces: provincesWithMao,
      selectedUnit: fBre,
      reachableMap: { MAO: [], PIC: [], GAS: [] },
      interactionMode: 'SUPPORT_PICK_TARGET',
      pendingAuxOrigin: 'GAS',
      units: [fBre, fGas],
    });
    expect(fillOf(step2Fleet.container, 'GAS')).toBe('#4ade80');
    expect(fillOf(step2Fleet.container, 'MAO')).toBe('#4ade80');
  });
});
