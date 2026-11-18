// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MapCameraBar } from './MapCameraBar';

function mockRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

describe('MapCameraBar', () => {
  it('renders icon buttons without percentage or text labels and wires callbacks', async () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetCamera = vi.fn();
    const containerRef = createRef<HTMLDivElement>();

    render(
      <div ref={containerRef}>
        <MapCameraBar
          containerRef={containerRef}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetCamera={onResetCamera}
        />
      </div>,
    );

    const bar = screen.getByTestId('map-camera-bar');
    expect(bar).toHaveAttribute('data-corner', 'bottom-right');
    expect(bar.textContent).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fit Map' }));

    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onResetCamera).toHaveBeenCalledOnce();
  });

  it('clamps within the visible map view and snaps to a nearby corner', () => {
    const containerRef = createRef<HTMLDivElement>();

    render(
      <div ref={containerRef}>
        <MapCameraBar
          containerRef={containerRef}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetCamera={vi.fn()}
        />
      </div>,
    );

    const container = containerRef.current!;
    const bar = screen.getByTestId('map-camera-bar');
    const handle = screen.getByTestId('map-camera-drag-handle');

    mockRect(container, { left: 0, top: 0, width: 1000, height: 600 });
    mockRect(bar, { left: 866, top: 550, width: 120, height: 36 });

    // Drag to the middle of the map view: stays free-floating
    fireEvent.pointerDown(handle, { button: 0, clientX: 880, clientY: 560 });
    expect(bar).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerMove(handle, { clientX: 480, clientY: 360 });
    expect(bar.style.left).toBe('466px');
    expect(bar.style.top).toBe('350px');

    fireEvent.pointerUp(handle);
    expect(bar).not.toHaveAttribute('data-dragging');
    expect(bar).not.toHaveAttribute('data-corner');

    // Drag past the top-left edge: clamps to (14, 14) and snaps to top-left corner
    mockRect(bar, { left: 466, top: 350, width: 120, height: 36 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 480, clientY: 360 });
    fireEvent.pointerMove(handle, { clientX: -500, clientY: -500 });
    expect(bar.style.left).toBe('14px');
    expect(bar.style.top).toBe('14px');

    fireEvent.pointerUp(handle);
    expect(bar).toHaveAttribute('data-corner', 'top-left');
    expect(bar.style.left).toBe('');
    expect(bar.style.top).toBe('');
  });
});
