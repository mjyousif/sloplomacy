// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateAccountDisplayName } from '../lib/supabase';
import type { AuthUser } from '../types/diplomacy';
import { AccountModal } from './AccountModal';

vi.mock('../lib/supabase', () => ({
  updateAccountDisplayName: vi.fn(),
}));

const mockedUpdate = vi.mocked(updateAccountDisplayName);

const baseUser: AuthUser = {
  id: 'user-1',
  user_id: 'user-1',
  email: 'real.person@gmail.com',
  displayName: 'Envoy',
  needsUsernameSetup: true,
};

describe('AccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows onboarding prompt and saves a new username', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpdated = vi.fn();
    const onSignOut = vi.fn();

    mockedUpdate.mockResolvedValue({
      user: {
        ...baseUser,
        displayName: 'Talleyrand',
        needsUsernameSetup: false,
      },
      error: null,
    });

    render(
      <AccountModal
        isOpen={true}
        user={baseUser}
        onboarding={true}
        onClose={onClose}
        onUpdated={onUpdated}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText('Choose Your Public Username')).toBeInTheDocument();
    const input = screen.getByLabelText('Public Username');
    expect(input).toHaveValue('');

    await user.type(input, 'Talleyrand');
    await user.click(screen.getByRole('button', { name: /Set Username/i }));

    expect(mockedUpdate).toHaveBeenCalledWith(baseUser, 'Talleyrand');
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Talleyrand' }),
      'Username updated to Talleyrand.',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills existing username in account settings mode and supports sign out', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpdated = vi.fn();
    const onSignOut = vi.fn();

    render(
      <AccountModal
        isOpen={true}
        user={{
          ...baseUser,
          displayName: 'Metternich',
          needsUsernameSetup: false,
        }}
        onboarding={false}
        onClose={onClose}
        onUpdated={onUpdated}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText('Account Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Public Username')).toHaveValue('Metternich');

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSignOut).toHaveBeenCalled();
  });

  it('shows validation or server error without closing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    mockedUpdate.mockResolvedValue({
      user: null,
      error: 'Username must be between 2 and 24 characters.',
    });

    render(
      <AccountModal
        isOpen={true}
        user={baseUser}
        onboarding={true}
        onClose={onClose}
        onUpdated={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Public Username'), 'AB');
    await user.click(screen.getByRole('button', { name: /Set Username/i }));

    expect(
      screen.getByText('Username must be between 2 and 24 characters.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
