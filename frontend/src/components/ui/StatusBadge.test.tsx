// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders status and size data attributes with text', () => {
    render(
      <StatusBadge status="your-move" size="md" testId="status-pill">
        Your move
      </StatusBadge>,
    );
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveTextContent('Your move');
    expect(pill).toHaveAttribute('data-status', 'your-move');
    expect(pill).toHaveAttribute('data-size', 'md');
  });
});
