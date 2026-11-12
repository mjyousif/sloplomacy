// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminSection } from './AdminSection';

describe('AdminSection', () => {
  it('opens the admin console', async () => {
    const onOpenAdminTools = vi.fn();
    render(<AdminSection onOpenAdminTools={onOpenAdminTools} />);
    expect(screen.getByText('CREATOR ADMIN TOOLS')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('btn-open-admin-console'));
    expect(onOpenAdminTools).toHaveBeenCalledTimes(1);
  });

  it('has no Direct-Edit button without a toggle handler', () => {
    render(<AdminSection onOpenAdminTools={vi.fn()} />);
    expect(screen.queryByText(/Direct-Edit/)).toBeNull();
  });

  it('shows and flips the Direct-Edit override', async () => {
    const onToggleAdminOverride = vi.fn();
    const { rerender } = render(
      <AdminSection
        onOpenAdminTools={vi.fn()}
        onToggleAdminOverride={onToggleAdminOverride}
      />,
    );
    const button = screen.getByTitle(
      'Toggle Direct-Edit Override on the board',
    );
    expect(button).toHaveTextContent('Direct-Edit: OFF');
    expect(button).not.toHaveClass('active');
    await userEvent.click(button);
    expect(onToggleAdminOverride).toHaveBeenCalledTimes(1);
    rerender(
      <AdminSection
        onOpenAdminTools={vi.fn()}
        adminOverrideActive
        onToggleAdminOverride={onToggleAdminOverride}
      />,
    );
    expect(button).toHaveTextContent('Direct-Edit: ON');
    expect(button).toHaveClass('active');
  });
});
