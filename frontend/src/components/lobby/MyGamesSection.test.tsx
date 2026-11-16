// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ME } from './lobby.testkit';
import { MyGamesSection, type MyGamesSectionProps } from './MyGamesSection';

function setup(over: Partial<MyGamesSectionProps> = {}) {
  const props: MyGamesSectionProps = {
    user: ME,
    onOpenAuth: vi.fn(),
    ...over,
  };
  const view = render(<MyGamesSection {...props} />);
  return { props, view, user: userEvent.setup() };
}

describe('MyGamesSection', () => {
  it('locks a guest out and offers sign-in', async () => {
    const { props, user } = setup({ user: null });
    expect(
      screen.getByText('Account Required to Save & Track Campaigns'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(props.onOpenAuth).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('points a player with no games at the Host game button', () => {
    setup();
    expect(
      screen.getByText(
        /Host a public or private campaign with Host game, or join/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
  });
});
