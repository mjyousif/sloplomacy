// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { game, ME, seat } from './lobby.testkit';
import {
  OpenLobbiesSection,
  type OpenLobbiesSectionProps,
} from './OpenLobbiesSection';

function setup(over: Partial<OpenLobbiesSectionProps> = {}) {
  const props: OpenLobbiesSectionProps = {
    user: ME,
    multiplayerLobbies: [],
    loadingGames: false,
    onRefreshGames: vi.fn(),
    hostFormPlace: 'on the right',
    joiningKey: null,
    handlePowerSlotClick: vi.fn(async () => {}),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const view = render(<OpenLobbiesSection {...props} />);
  return { props, view, user: userEvent.setup() };
}

describe('OpenLobbiesSection', () => {
  it('says there are no lobbies, and where the Host form is', () => {
    const a = setup();
    expect(
      screen.getByText('No Active Campaigns Right Now'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Host a new public or private match on the right, or join/,
      ),
    ).toBeInTheDocument();
    a.view.unmount();
    setup({ hostFormPlace: 'below' });
    expect(
      screen.getByText(/private match below, or join/),
    ).toBeInTheDocument();
  });

  it('draws one card per lobby, in order', () => {
    setup({
      multiplayerLobbies: [
        game({ game_id: 'a', name: 'First' }),
        game({ game_id: 'b', name: 'Second' }),
      ],
    });
    expect(
      screen.queryByText('No Active Campaigns Right Now'),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['First', 'Second']);
  });

  it('refreshes, and locks the button and spins while loading', async () => {
    const idle = setup();
    const btn = screen.getByRole('button', { name: /Refresh/ });
    expect(btn).toBeEnabled();
    expect(btn.querySelector('svg')).not.toHaveClass('spin-icon');
    await idle.user.click(btn);
    expect(idle.props.onRefreshGames).toHaveBeenCalledTimes(1);
    idle.view.unmount();
    setup({ loadingGames: true });
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Refresh/ }).querySelector('svg'),
    ).toHaveClass('spin-icon');
  });

  it('passes a seat press and a leave press up with their game', async () => {
    const mine = game({
      game_id: 'a',
      name: 'Mine',
      participants: { FRANCE: seat('FRANCE', 'me') },
    });
    const open = game({ game_id: 'b', name: 'Open' });
    const { props, user } = setup({ multiplayerLobbies: [mine, open] });
    const card = (n: string) =>
      screen.getByText(n).closest('.lobby-game-card') as HTMLElement;
    await user.click(within(card('Open')).getByText('+ Claim Germany'));
    expect(props.handlePowerSlotClick).toHaveBeenCalledExactlyOnceWith(
      open,
      'GERMANY',
    );
    await user.click(
      within(card('Mine')).getByTitle('Surrender command and leave this match'),
    );
    expect(props.onOpenSurrenderModal).toHaveBeenCalledExactlyOnceWith(
      mine,
      'FRANCE',
    );
  });

  it('marks the seat being entered', () => {
    setup({
      multiplayerLobbies: [game({ game_id: 'a' })],
      joiningKey: 'a_ITALY',
    });
    expect(screen.getByText('Entering...')).toBeInTheDocument();
  });
});
