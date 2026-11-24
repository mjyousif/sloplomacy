// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountBadge } from './CountBadge';

describe('CountBadge', () => {
  it('renders nothing when count is zero or negative', () => {
    const { container } = render(<CountBadge count={0} testId="badge" />);
    expect(container.firstChild).toBeNull();
  });

  it('caps the displayed value at max+', () => {
    const { rerender } = render(
      <CountBadge count={5} max={9} testId="badge" />,
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('5');

    rerender(<CountBadge count={12} max={9} testId="badge" />);
    expect(screen.getByTestId('badge')).toHaveTextContent('9+');

    rerender(<CountBadge count={140} testId="badge" />);
    expect(screen.getByTestId('badge')).toHaveTextContent('99+');
  });

  it('applies placement, size, role, and aria-label attributes', () => {
    render(
      <CountBadge
        count={3}
        placement="floating"
        size="xs"
        role="status"
        ariaLabel="3 unread messages"
        testId="badge"
      />,
    );
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveAttribute('data-placement', 'floating');
    expect(badge).toHaveAttribute('data-size', 'xs');
    expect(badge).toHaveAttribute('role', 'status');
    expect(badge).toHaveAttribute('aria-label', '3 unread messages');
  });
});
