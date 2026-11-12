// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LobbyHero, type LobbyHeroProps } from './LobbyHero';
import { ME } from './lobby.testkit';

function setup(over: Partial<LobbyHeroProps> = {}) {
  const props: LobbyHeroProps = {
    user: null,
    onEnterSandbox: vi.fn(),
    onOpenAuth: vi.fn(),
    ...over,
  };
  render(<LobbyHero {...props} />);
  return { props, user: userEvent.setup() };
}

describe('LobbyHero', () => {
  it('invites a guest to the sandbox or to sign in', async () => {
    const { props, user } = setup();
    expect(
      screen.getByRole('heading', { name: 'The Chancellery of Europe' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Guest Solo Sandbox/)).toBeInTheDocument();
    await user.click(screen.getByTestId('btn-enter-sandbox'));
    expect(screen.getByTestId('btn-enter-sandbox')).toHaveTextContent(
      'Launch Solo Sandbox (Guest)',
    );
    expect(props.onEnterSandbox).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', {
        name: 'Sign In / Create Account for Multiplayer',
      }),
    );
    expect(props.onOpenAuth).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('welcomes a signed-in player and drops the sign-in button', () => {
    setup({ user: ME });
    expect(screen.getByText(/Welcome back, Envoy/)).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByTestId('btn-enter-sandbox')).toHaveTextContent(
      'Launch Solo Sandbox',
    );
    expect(screen.getByTestId('btn-enter-sandbox')).not.toHaveTextContent(
      'Guest',
    );
    expect(
      screen.queryByText(/Sign In \/ Create Account/),
    ).not.toBeInTheDocument();
  });

  it('names the era and the adjudicator', () => {
    setup();
    expect(screen.getByText('STANDARD 1901 DIPLOMACY')).toBeInTheDocument();
    expect(screen.getByText('DATC ADJUDICATOR')).toBeInTheDocument();
  });

  it('describes both modes', () => {
    setup();
    expect(
      screen.getByText('Solo Sandbox (Guest or Practice)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Multiplayer Campaigns (Public & Private)'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      [
        'Switch freely between all 7 Great Powers',
        'Tactical AI auto-plans opponent moves & steps turns',
        'Simulate bounces, supports & convoy chains',
        'Host public or passcode-protected private campaigns',
        'Invite players via Game ID & secret passcode',
        'Issue & finalize orders strictly for your nation',
      ],
    );
  });
});
