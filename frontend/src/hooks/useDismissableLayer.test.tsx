// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDismissableLayer } from './useDismissableLayer';

function Harness({
  open,
  onDismiss,
  capture,
  withRestoreFocus = true,
}: {
  open: boolean;
  onDismiss: () => void;
  capture?: boolean;
  withRestoreFocus?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useDismissableLayer({
    open,
    rootRef,
    onDismiss,
    restoreFocusRef: withRestoreFocus ? triggerRef : undefined,
    capture,
  });

  return (
    <div>
      <button type="button" data-testid="outside-btn">
        Outside
      </button>
      <div ref={rootRef} data-testid="root">
        <button ref={triggerRef} type="button" data-testid="trigger-btn">
          Trigger
        </button>
        {open && (
          <div data-testid="menu">
            <button type="button" data-testid="inside-btn">
              Inside
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

describe('useDismissableLayer', () => {
  it('dismisses on outside pointerdown and ignores clicks inside rootRef', () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);

    fireEvent.pointerDown(screen.getByTestId('inside-btn'));
    fireEvent.pointerDown(screen.getByTestId('trigger-btn'));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('outside-btn'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape, stops propagation, and restores focus to trigger', () => {
    const onDismiss = vi.fn();
    const windowBubbleListener = vi.fn();
    window.addEventListener('keydown', windowBubbleListener);
    try {
      render(<Harness open onDismiss={onDismiss} />);
      screen.getByTestId('inside-btn').focus();

      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(windowBubbleListener).toHaveBeenCalledTimes(1);

      windowBubbleListener.mockClear();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('trigger-btn')).toHaveFocus();
      expect(windowBubbleListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowBubbleListener);
    }
  });

  it('does not attach listeners while closed and cleans up on close/unmount', () => {
    const onDismiss = vi.fn();
    const { rerender, unmount } = render(
      <Harness open={false} onDismiss={onDismiss} />,
    );

    fireEvent.pointerDown(screen.getByTestId('outside-btn'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(<Harness open onDismiss={onDismiss} />);
    rerender(<Harness open={false} onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId('outside-btn'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(<Harness open onDismiss={onDismiss} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('supports capture-phase dismissal and always calls the latest onDismiss', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness open onDismiss={first} capture />);
    rerender(<Harness open onDismiss={second} capture />);

    const bubbleStop = (e: Event) => e.stopPropagation();
    document.body.addEventListener('pointerdown', bubbleStop);
    try {
      fireEvent.pointerDown(screen.getByTestId('outside-btn'));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeEventListener('pointerdown', bubbleStop);
    }
  });
});
