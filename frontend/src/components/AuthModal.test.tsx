// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthModal } from './AuthModal';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  sendMagicLink: vi.fn(),
  signInWithEmailPassword: vi.fn(async () => ({
    user: null,
    error: 'Invalid login credentials',
  })),
  signInWithOAuthProvider: vi.fn(),
  signUpWithEmailPassword: vi.fn(),
}));

type Tab = 'signin' | 'signup' | 'magic';

const renderModal = (isOpen: boolean, initialTab: Tab) => (
  <AuthModal
    isOpen={isOpen}
    onClose={vi.fn()}
    onSuccess={vi.fn()}
    initialTab={initialTab}
  />
);

const activeTab = () =>
  document.querySelector('.auth-tab.active')?.textContent?.trim();

describe('AuthModal', () => {
  it('does not render while closed', () => {
    render(renderModal(false, 'signin'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the tab it is given', () => {
    render(renderModal(true, 'signup'));
    expect(activeTab()).toBe('Create Account');
  });

  it('opens on the new tab when reopened with a different initialTab', () => {
    const { rerender } = render(renderModal(true, 'signin'));
    expect(activeTab()).toBe('Sign In');

    rerender(renderModal(false, 'signin'));
    rerender(renderModal(true, 'signup'));

    expect(activeTab()).toBe('Create Account');
    expect(
      screen.getByRole('button', { name: 'Create Diplomatic Account' }),
    ).toBeInTheDocument();
  });

  it('switches tab when initialTab changes while it is open', () => {
    const { rerender } = render(renderModal(true, 'signin'));
    rerender(renderModal(true, 'signup'));
    expect(activeTab()).toBe('Create Account');
  });

  it('goes back to initialTab after the player picked another tab and closed it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderModal(true, 'signin'));
    await user.click(screen.getByRole('button', { name: 'Magic Link' }));
    expect(activeTab()).toBe('Magic Link');

    rerender(renderModal(false, 'signin'));
    rerender(renderModal(true, 'signin'));

    expect(activeTab()).toBe('Sign In');
  });

  it('clears the email, password and error from the last opening', async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderModal(true, 'signin'));
    await user.type(screen.getByLabelText(/Email Address/), 'a@b.eu');
    await user.type(screen.getByLabelText(/Password/), 'secret123');
    await user.click(
      screen.getByRole('button', { name: 'Sign In to Chancellery' }),
    );
    expect(
      await screen.findByText('Invalid login credentials'),
    ).toBeInTheDocument();

    rerender(renderModal(false, 'signin'));
    rerender(renderModal(true, 'signin'));

    expect(screen.getByLabelText(/Email Address/)).toHaveValue('');
    expect(screen.getByLabelText(/Password/)).toHaveValue('');
    expect(
      screen.queryByText('Invalid login credentials'),
    ).not.toBeInTheDocument();
  });
});
