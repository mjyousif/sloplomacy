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
});
