// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonVariant } from './Button';

describe('Button', () => {
  it('renders defaults (type="button", secondary variant, md size)', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveAttribute('data-variant', 'secondary');
    expect(btn).toHaveAttribute('data-size', 'md');
    expect(btn).not.toHaveAttribute('data-full-width');
  });

  it.each<ButtonVariant>([
    'primary',
    'secondary',
    'danger',
    'danger-soft',
    'ghost',
  ])('applies data-variant="%s"', (variant) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole('button', { name: 'Action' })).toHaveAttribute(
      'data-variant',
      variant,
    );
  });

  it('supports size="sm", fullWidth, type="submit", custom className, and ref forwarding', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();

    render(
      <Button
        ref={ref}
        type="submit"
        variant="primary"
        size="sm"
        fullWidth
        className="extra-class"
        onClick={onClick}
      >
        Submit
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Submit' });
    expect(ref.current).toBe(btn);
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('data-variant', 'primary');
    expect(btn).toHaveAttribute('data-size', 'sm');
    expect(btn).toHaveAttribute('data-full-width', 'true');
    expect(btn).toHaveClass('extra-class');

    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Locked
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Locked' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
