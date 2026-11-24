// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

describe('SegmentedControl', () => {
  it('renders toggle semantics with role="group" and aria-pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="score"
        onChange={onChange}
        ariaLabel="Sort standings"
        semantics="toggle"
        tone="sky"
        size="sm"
        options={[
          { value: 'score', label: 'By Score', testId: 'opt-score' },
          { value: 'default', label: 'Default', testId: 'opt-default' },
        ]}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Sort standings' }),
    ).toBeInTheDocument();
    const score = screen.getByTestId('opt-score');
    const def = screen.getByTestId('opt-default');
    expect(score).toHaveAttribute('aria-pressed', 'true');
    expect(score).toHaveAttribute('data-active', 'true');
    expect(def).toHaveAttribute('aria-pressed', 'false');
    expect(def).not.toHaveAttribute('data-active');

    await user.click(def);
    expect(onChange).toHaveBeenCalledWith('default');
  });

  it('renders tablist semantics with role="tab", aria-selected, and arrow-key navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="overview"
        onChange={onChange}
        ariaLabel="War Ledger"
        semantics="tabs"
        tone="gold"
        options={[
          { value: 'overview', label: 'Overview', testId: 'tab-overview' },
          { value: 'timeline', label: 'Timeline', testId: 'tab-timeline' },
          { value: 'diplomacy', label: 'Diplomacy', testId: 'tab-diplomacy' },
        ]}
      />,
    );

    expect(
      screen.getByRole('tablist', { name: 'War Ledger' }),
    ).toBeInTheDocument();
    const overview = screen.getByRole('tab', { name: 'Overview' });
    const timeline = screen.getByRole('tab', { name: 'Timeline' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(timeline).toHaveAttribute('aria-selected', 'false');

    overview.focus();
    await user.keyboard('{ArrowRight}');
    expect(timeline).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('timeline');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Diplomacy' })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('diplomacy');

    await user.keyboard('{Home}');
    expect(overview).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('overview');
  });
});
