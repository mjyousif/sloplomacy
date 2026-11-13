// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapControlsSection } from './MapControlsSection';

describe('MapControlsSection', () => {
  it('shows the zoom level and wires each button to its own callback', async () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetCamera = vi.fn();
    render(
      <MapControlsSection
        zoomPercent={140}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetCamera={onResetCamera}
      />,
    );
    expect(screen.getByText('MAP VIEW & CAMERA')).toBeInTheDocument();
    expect(screen.getByTestId('tools-zoom-badge')).toHaveTextContent('140%');
    await userEvent.click(screen.getByTitle('Zoom In'));
    expect(
      [onZoomIn, onZoomOut, onResetCamera].map((f) => f.mock.calls.length),
    ).toEqual([1, 0, 0]);
    await userEvent.click(screen.getByTitle('Zoom Out'));
    await userEvent.click(screen.getByTitle('Reset Map to 105% Default View'));
    expect(
      [onZoomIn, onZoomOut, onResetCamera].map((f) => f.mock.calls.length),
    ).toEqual([1, 1, 1]);
  });

  it('is not collapsible', () => {
    render(
      <MapControlsSection
        zoomPercent={105}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetCamera={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /MAP VIEW/ })).toBeNull();
  });
});
