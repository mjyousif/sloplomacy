// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { A_PAR, issue, progressFor } from '../../test/macroFixtures';
import { CollapsedRail } from './CollapsedRail';

const rail = (progress = progressFor(), onToggleCollapse?: () => void) =>
  render(
    <CollapsedRail
      activePower="FRANCE"
      progress={progress}
      onToggleCollapse={onToggleCollapse}
    />,
  ).container;

describe('CollapsedRail', () => {
  it('shows the crest with the power, its units and its centers', () => {
    const c = rail();
    const crest = c.querySelector('.rail-power-crest') as HTMLElement;
    expect(crest).toHaveAttribute(
      'title',
      'Commanding French Republic (3 Units, 3 SC)',
    );
  });

  it('draws the crest flag at 18 by 12', () => {
    const flag = rail().querySelector('svg.power-flag') as SVGElement;
    expect([flag.getAttribute('width'), flag.getAttribute('height')]).toEqual([
      '18',
      '12',
    ]);
  });

  it('shows the unconfirmed count, or a check when everything is confirmed', () => {
    expect(rail().querySelector('.rail-badge-unconfirmed')).toHaveTextContent(
      '3',
    );
    const confirmed = Object.fromEntries(
      Object.values(progressFor().unitsByProv).map((u) => [
        u.id,
        { unit_id: u.id, is_explicit: true },
      ]),
    );
    const c = rail(progressFor({ orders: confirmed as never }));
    expect(c.querySelectorAll('.rail-badge-clean')[0]).toHaveTextContent('✓');
  });

  it('warns about every issue, informational ones included', () => {
    expect(rail().querySelector('.rail-warn-badge')).toBeNull();
    const c = rail(progressFor({ issues: [issue(A_PAR, 'info')] }));
    expect(c.querySelector('.rail-warn-badge')).toHaveAttribute(
      'title',
      '1 tactical issues',
    );
  });

  it('expands from either button, when something can expand it', () => {
    const onToggleCollapse = vi.fn();
    rail(progressFor(), onToggleCollapse);
    fireEvent.click(screen.getByTestId('macro-sidebar-expand-btn'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Tactical Orders' }),
    );
    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it('has no buttons without a toggle', () => {
    const c = rail();
    expect(c.querySelectorAll('button')).toHaveLength(0);
  });

  it('shows admin edit-board icons and staged change count instead of country/unit icons', () => {
    const onToggleCollapse = vi.fn();
    const { container, rerender } = render(
      <CollapsedRail
        activePower="FRANCE"
        progress={progressFor({ issues: [issue(A_PAR, 'info')] })}
        onToggleCollapse={onToggleCollapse}
        adminMode="direct-edit"
        stagedChangesCount={0}
      />,
    );
    expect(container.querySelector('.rail-power-crest')).toBeNull();
    expect(container.querySelector('svg.power-flag')).toBeNull();
    expect(container.querySelector('.rail-badge-unconfirmed')).toBeNull();
    expect(container.querySelector('.rail-warn-badge')).toBeNull();
    expect(container.querySelector('.rail-admin-badge')).toBeNull();
    const editCrest = container.querySelector(
      '.rail-admin-crest',
    ) as HTMLElement;
    expect(editCrest).toHaveAttribute('title', 'Edit Board');
    expect(editCrest.querySelector('svg.lucide-pencil')).not.toBeNull();
    expect(screen.getByTestId('macro-sidebar-expand-btn')).toHaveAttribute(
      'title',
      'Expand Edit Board',
    );

    rerender(
      <CollapsedRail
        activePower="FRANCE"
        progress={progressFor({ issues: [issue(A_PAR, 'info')] })}
        onToggleCollapse={onToggleCollapse}
        adminMode="direct-edit"
        stagedChangesCount={2}
      />,
    );
    expect(container.querySelector('.rail-badge-staged')).toHaveTextContent(
      '2',
    );
  });

  it('shows admin turn-clock clock icon instead of country/unit icons or shield', () => {
    const { container } = render(
      <CollapsedRail
        activePower="FRANCE"
        progress={progressFor({ issues: [issue(A_PAR, 'info')] })}
        onToggleCollapse={vi.fn()}
        adminMode="turn-clock"
      />,
    );
    expect(container.querySelector('.rail-power-crest')).toBeNull();
    expect(container.querySelector('svg.power-flag')).toBeNull();
    expect(container.querySelector('.rail-warn-badge')).toBeNull();
    expect(container.querySelector('.rail-admin-badge')).toBeNull();
    const clockCrest = container.querySelector(
      '.rail-admin-crest',
    ) as HTMLElement;
    expect(clockCrest).toHaveAttribute('title', 'Turn and Clock Settings');
    expect(clockCrest.querySelector('svg.lucide-clock')).not.toBeNull();
    expect(screen.getByTestId('macro-sidebar-expand-btn')).toHaveAttribute(
      'title',
      'Expand Turn and Clock Settings',
    );
  });
});
