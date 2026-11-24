// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useOverlayFocusEscape } from './useOverlayFocusEscape';

function Harness({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useOverlayFocusEscape({ open, focusRef: closeRef, onClose });
  return (
    <div>
      <button ref={closeRef} type="button" data-testid="close-btn">
        Close
      </button>
    </div>
  );
}

describe('useOverlayFocusEscape', () => {
  it('focuses the target element when opened and closes on Escape only while open', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <Harness open={false} onClose={onClose} />,
    );
    expect(screen.getByTestId('close-btn')).not.toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Harness open={true} onClose={onClose} />);
    expect(screen.getByTestId('close-btn')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={true} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
