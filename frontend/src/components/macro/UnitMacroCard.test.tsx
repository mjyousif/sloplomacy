// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  F_ENG,
  issue,
  MACRO_PROVINCES,
  OPTIONS_A_BRE,
  unitsByProvince,
} from '../../test/macroFixtures';
import { orderFor, unitAt } from '../../test/mapFixtures';
import { POWER_METADATA } from '../../types/diplomacy';
import { UnitMacroCard } from './UnitMacroCard';

type Props = Parameters<typeof UnitMacroCard>[0];

const card = (over: Partial<Props> = {}) => {
  const fns = {
    onSelectUnit: vi.fn(),
    onHoverUnit: vi.fn(),
    onHighlightProvinces: vi.fn(),
    onUpdateOrder: vi.fn(),
    handleOrderTypeChange: vi.fn(),
  };
  const props: Props = {
    unit: A_BRE,
    order: orderFor(A_BRE, 'HOLD', { is_explicit: false }),
    powerMeta: POWER_METADATA.FRANCE,
    provinces: MACRO_PROVINCES,
    units: ALL_UNITS,
    unitsByProv: unitsByProvince(ALL_UNITS),
    orders: {},
    reachable: [{ province: 'PAR', coasts: [] }],
    validRetreats: [],
    unitOptions: OPTIONS_A_BRE,
    summary: { verb: 'HOLD', targetText: 'Holding Brest', badgeColor: '#555' },
    unitIssues: [],
    simRes: null,
    isSelected: false,
    isHovered: false,
    hasError: false,
    hasWarn: false,
    isDisbanding: false,
    isRetreatPhase: false,
    isAdjustmentPhase: false,
    buildCount: 0,
    ...fns,
    ...over,
  };
  const view = render(<UnitMacroCard {...props} />);
  const root = view.container.firstElementChild as HTMLElement;
  return { ...view, root, ...fns };
};

const pill = (root: HTMLElement) =>
  root.querySelector('[data-testid="unit-mini-pill"]')?.textContent?.trim();

describe('UnitMacroCard header', () => {
  it("shows the province, the unit type and the unit's coast", () => {
    const fleet = unitAt('FRANCE', 'F', 'BRE', { coast: 'NC' });
    const { root } = card({ unit: fleet });
    expect(
      root.querySelector('[data-testid="unit-prov-title"]'),
    ).toHaveTextContent('BrestBRE/NC');
    expect(
      root.querySelector('[data-testid="unit-type-badge"]'),
    ).toHaveAttribute('data-unit-type', 'fleet');
    expect(
      card().root.querySelector('[data-testid="unit-type-badge"]'),
    ).toHaveAttribute('data-unit-type', 'army');
  });

  it('colours the badge by power, orange when dislodged, red when disbanding', () => {
    const badge = (r: HTMLElement) =>
      r.querySelector('[data-testid="unit-type-badge"]') as HTMLElement;
    expect(badge(card().root)).toHaveStyle({
      backgroundColor: POWER_METADATA.FRANCE.color,
    });
    const dislodged = unitAt('FRANCE', 'A', 'BRE', { is_dislodged: true });
    const d = card({ unit: dislodged });
    expect(badge(d.root)).toHaveStyle({ backgroundColor: '#ea580c' });
    expect(d.root).toHaveStyle({ borderLeft: '4px solid #ea580c' });
    const x = card({ isDisbanding: true });
    expect(badge(x.root)).toHaveStyle({ backgroundColor: '#dc2626' });
    expect(x.root).toHaveStyle({ borderLeft: '4px solid #dc2626' });
  });

  it.each<[string, Partial<Props>, string]>([
    ['unordered', {}, 'Hold'],
    [
      'explicit',
      { order: orderFor(A_BRE, 'MOVE', { target: 'PAR' }) },
      'Ready',
    ],
    ['warning', { hasWarn: true }, 'Warning'],
    ['error', { hasError: true, hasWarn: true }, 'Illegal'],
    ['disbanding', { isDisbanding: true, hasError: true }, 'Disbanding'],
    [
      'dislodged',
      {
        unit: unitAt('FRANCE', 'A', 'BRE', { is_dislodged: true }),
        isDisbanding: true,
      },
      'Dislodged',
    ],
    ['winter', { isAdjustmentPhase: true }, 'Retained'],
    [
      'a unit waiting out a retreat phase',
      { isRetreatPhase: true },
      'Retained',
    ],
  ])('status pill: %s', (_name, over, label) => {
    expect(pill(card(over).root)).toBe(label);
  });

  it('flags the card as selected, hovered, in error or in warning', () => {
    const { root } = card({
      isSelected: true,
      isHovered: true,
      hasError: true,
    });
    expect(root).toHaveAttribute('data-selected', 'true');
    expect(root).toHaveAttribute('data-hovered', 'true');
    expect(root).toHaveAttribute('data-status', 'error');
    expect(card({ hasWarn: true }).root).toHaveAttribute(
      'data-status',
      'warning',
    );
    expect(card({ hasError: true, hasWarn: true }).root).toHaveAttribute(
      'data-status',
      'error',
    );
  });

  it('shows the order summary, or Retain in winter', () => {
    const { root } = card({
      summary: { verb: 'MOVE', targetText: 'to Paris', badgeColor: '#123456' },
    });
    expect(
      root.querySelector('[data-testid="behavior-verb-tag"]'),
    ).toHaveTextContent('MOVE');
    expect(
      root.querySelector('[data-testid="behavior-target-text"]'),
    ).toHaveTextContent('to Paris');
    const winter = card({ isAdjustmentPhase: true });
    expect(
      winter.root.querySelector('[data-testid="behavior-verb-tag"]'),
    ).toHaveTextContent('RETAIN');
    expect(
      winter.root.querySelector('[data-testid="behavior-target-text"]'),
    ).toHaveTextContent('Retained in Brest');
    const disband = card({ isAdjustmentPhase: true, isDisbanding: true });
    expect(
      disband.root.querySelector('[data-testid="behavior-verb-tag"]'),
    ).toHaveTextContent('HOLD');
  });
});

describe('UnitMacroCard pointer behaviour', () => {
  it('selects on click and deselects a selected card', () => {
    const a = card();
    fireEvent.click(a.root);
    expect(a.onSelectUnit).toHaveBeenCalledWith(A_BRE.id);
    a.unmount();
    const b = card({ isSelected: true });
    fireEvent.click(b.root);
    expect(b.onSelectUnit).toHaveBeenCalledWith(null);
  });

  it("highlights the unit's province, target and supported unit while hovered", () => {
    const { root, onHoverUnit, onHighlightProvinces } = card({
      order: orderFor(A_BRE, 'SUPPORT', {
        target: 'PIC',
        aux_unit_origin: 'PAR',
      }),
    });
    fireEvent.pointerEnter(root, { pointerType: 'mouse' });
    expect(onHoverUnit).toHaveBeenCalledWith(A_BRE.id);
    expect(onHighlightProvinces).toHaveBeenCalledWith(['BRE', 'PIC', 'PAR']);
    fireEvent.pointerLeave(root, { pointerType: 'mouse' });
    expect(onHoverUnit).toHaveBeenLastCalledWith(null);
    expect(onHighlightProvinces).toHaveBeenLastCalledWith([]);
  });

  it('ignores a touch, so a tap leaves no hover behind', () => {
    const { root, onHoverUnit, onHighlightProvinces } = card();
    fireEvent.pointerEnter(root, { pointerType: 'touch' });
    fireEvent.pointerLeave(root, { pointerType: 'touch' });
    expect(onHoverUnit).not.toHaveBeenCalled();
    expect(onHighlightProvinces).not.toHaveBeenCalled();
  });

  it('keeps a click on the controls from selecting the card', () => {
    const { onSelectUnit, handleOrderTypeChange } = card();
    fireEvent.click(screen.getByTestId('btn-order-type-MOVE'));
    expect(handleOrderTypeChange).toHaveBeenCalledWith(A_BRE, 'MOVE');
    expect(onSelectUnit).not.toHaveBeenCalled();
  });
});

describe('UnitMacroCard order controls', () => {
  it("movement: tabs and the selects of the unit's order", () => {
    const { root } = card({
      order: orderFor(A_BRE, 'MOVE', { target: 'PAR' }),
    });
    const controls = root.querySelector(
      '[data-testid="unit-inline-controls"]',
    ) as HTMLElement;
    expect(controls.children[0]).toHaveAttribute(
      'data-testid',
      'order-type-tabs',
    );
    expect(
      controls.querySelector('[data-testid="select-order-target"]'),
    ).not.toBeNull();
  });

  it('movement: a hold has tabs and no selects', () => {
    const { root } = card();
    expect(root.querySelectorAll('select')).toHaveLength(0);
    expect(
      root.querySelectorAll('[data-testid="order-type-tabs"] button').length,
    ).toBeGreaterThan(0);
  });

  it('retreat: a dislodged unit gets the retreat tabs and its select', () => {
    const dislodged = unitAt('FRANCE', 'A', 'BRE', { is_dislodged: true });
    const { root } = card({
      unit: dislodged,
      isRetreatPhase: true,
      validRetreats: [{ province: 'PAR', coasts: [] }],
      order: orderFor(dislodged, 'RETREAT', { target: 'PAR' }),
    });
    expect(screen.getByTestId('btn-order-retreat')).toBeInTheDocument();
    expect(
      root.querySelector('[data-testid="select-retreat-target"]'),
    ).not.toBeNull();
  });

  it('retreat: a unit that stands gets nothing to choose', () => {
    const { root } = card({ isRetreatPhase: true });
    expect(
      root.querySelector('[data-testid="unit-inline-controls"]')?.innerHTML,
    ).toBe('');
  });

  it('winter: keep or disband only when units must go, and never a select', () => {
    const owed = card({
      isAdjustmentPhase: true,
      buildCount: -1,
      order: orderFor(A_BRE, 'MOVE', { target: 'PAR' }),
    });
    expect(screen.getByTestId('btn-adjustment-keep')).toBeInTheDocument();
    expect(owed.root.querySelectorAll('select')).toHaveLength(0);
    owed.unmount();
    const none = card({ isAdjustmentPhase: true, buildCount: 1 });
    expect(
      none.root.querySelector('[data-testid="unit-inline-controls"]')
        ?.innerHTML,
    ).toBe('');
  });
});

describe('UnitMacroCard diagnostics and simulation', () => {
  it('lists each issue, with an info icon only for information', () => {
    const { root } = card({
      unitIssues: [issue(A_PAR, 'error', 'e1'), issue(A_PAR, 'info', 'i1')],
    });
    const alerts = root.querySelectorAll(
      '[data-testid="unit-diagnostic-alert"]',
    );
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveAttribute('data-severity', 'error');
    expect(alerts[0]).toHaveTextContent('Title e1: Message e1');
    expect(alerts[1]).toHaveAttribute('data-severity', 'info');
  });

  it('shows how a simulated order resolved', () => {
    const ok = card({
      simRes: {
        unit_id: A_BRE.id,
        origin: 'BRE',
        order_type: 'MOVE',
        succeeded: true,
        bounced: false,
        cut: false,
        dislodged: false,
        reason: 'Moved.',
      } as never,
    });
    expect(
      ok.root.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toHaveAttribute('data-outcome', 'ok');
    expect(
      ok.root.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toHaveTextContent('✓ SIMULATED: Moved.');
    ok.unmount();
    const bad = card({
      simRes: { succeeded: false, reason: 'Bounced.' } as never,
    });
    expect(
      bad.root.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toHaveAttribute('data-outcome', 'fail');
    expect(
      bad.root.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toHaveTextContent('✕ BOUNCED / CUT: Bounced.');
  });

  it('shows no strip without a result', () => {
    expect(
      card().root.querySelector('[data-testid="unit-sim-result-strip"]'),
    ).toBeNull();
  });
});

describe('UnitMacroCard convoy tab', () => {
  it('offers Convoy to a fleet at sea', () => {
    card({ unit: F_ENG, order: orderFor(F_ENG, 'HOLD') });
    expect(screen.getByTestId('btn-order-type-CONVOY')).toBeInTheDocument();
  });
});

describe('UnitMacroCard compact dropdown hover', () => {
  it('highlights the hovered dropdown option province on the map and restores on leave', () => {
    const { root, onHighlightProvinces } = card({
      compact: true,
      unitOptions: null,
      order: orderFor(A_BRE, 'SUPPORT', {
        target: 'PIC',
        aux_unit_origin: 'PAR',
      }),
    });
    fireEvent.pointerEnter(root, { pointerType: 'mouse' });
    expect(onHighlightProvinces).toHaveBeenLastCalledWith([
      'BRE',
      'PIC',
      'PAR',
    ]);

    fireEvent.click(screen.getByTestId('select-support-unit'));
    const parisOpt = screen.getByRole('option', { name: /Paris/ });
    fireEvent.pointerEnter(parisOpt, { pointerType: 'mouse' });
    expect(onHighlightProvinces).toHaveBeenLastCalledWith(['PAR']);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onHighlightProvinces).toHaveBeenLastCalledWith([
      'BRE',
      'PIC',
      'PAR',
    ]);
  });

  it('uses native select elements when useNativeSelect is true (mobile sheet)', () => {
    const first = card({
      compact: true,
      useNativeSelect: true,
      unitOptions: null,
      order: orderFor(A_BRE, 'SUPPORT', {
        target: 'PIC',
        aux_unit_origin: 'PAR',
      }),
    });
    expect(screen.getByTestId('select-support-unit').tagName).toBe('SELECT');
    expect(screen.getByTestId('select-support-target').tagName).toBe('SELECT');
    first.unmount();

    card({
      compact: false,
      useNativeSelect: true,
      unitOptions: null,
      order: orderFor(A_BRE, 'SUPPORT', {
        target: 'PIC',
        aux_unit_origin: 'PAR',
      }),
    });
    expect(screen.getByTestId('select-support-unit').tagName).toBe('SELECT');
    expect(screen.getByTestId('select-support-target').tagName).toBe('SELECT');
  });
});
