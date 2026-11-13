// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CollapsedRail, type CollapsedRailProps } from './CollapsedRail';

const props = (
  extra: Partial<CollapsedRailProps> = {},
): CollapsedRailProps => ({
  onToggleCollapse: vi.fn(),
  zoomPercent: 120,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onResetCamera: vi.fn(),
  sandboxMode: false,
  onToggleSandboxMode: vi.fn(),
  ...extra,
});

describe('CollapsedRail', () => {
  it('is a labelled rail that shows the zoom level', () => {
    render(<CollapsedRail {...props()} />);
    expect(screen.getByLabelText('Tools Sidebar Collapsed')).toHaveClass(
      'tools-sidebar-collapsed',
    );
    expect(screen.getByTitle('Current Zoom: 120%')).toBeInTheDocument();
  });

  it('expands from either end', async () => {
    const onToggleCollapse = vi.fn();
    render(<CollapsedRail {...props({ onToggleCollapse })} />);
    await userEvent.click(screen.getByTestId('tools-sidebar-expand-btn'));
    await userEvent.click(screen.getByTitle('Expand Tools'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it('zooms and resets', async () => {
    const p = props();
    render(<CollapsedRail {...p} />);
    await userEvent.click(screen.getByTitle('Zoom In (+)'));
    await userEvent.click(screen.getByTitle('Zoom Out (-)'));
    await userEvent.click(screen.getByTitle('Fit Map / Reset Camera'));
    expect(
      [p.onZoomIn, p.onZoomOut, p.onResetCamera].map(
        (f) => (f as ReturnType<typeof vi.fn>).mock.calls.length,
      ),
    ).toEqual([1, 1, 1]);
  });

  it('toggles Hypothetical Mode and glows while it is on', async () => {
    const p = props();
    const { rerender } = render(<CollapsedRail {...p} />);
    const button = screen.getByTitle('Enter Hypothetical Mode');
    expect(button).not.toHaveClass('rail-active-glow');
    await userEvent.click(button);
    expect(p.onToggleSandboxMode).toHaveBeenCalledTimes(1);
    rerender(<CollapsedRail {...p} sandboxMode />);
    expect(
      screen.getByTitle('Hypothetical Mode ACTIVE (Click to toggle)'),
    ).toHaveClass('rail-active-glow');
  });
});
