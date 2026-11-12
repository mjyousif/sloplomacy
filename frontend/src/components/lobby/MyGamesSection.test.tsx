// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { game, ME, seat } from './lobby.testkit';
import { MyGamesSection, type MyGamesSectionProps } from './MyGamesSection';

function setup(over: Partial<MyGamesSectionProps> = {}) {
  const props: MyGamesSectionProps = {
    user: ME,
    myGames: [],
    hostFormPlace: 'on the right',
    handlePowerSlotClick: vi.fn(async () => {}),
    onOpenAuth: vi.fn(),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const view = render(<MyGamesSection {...props} />);
  return { props, view, user: userEvent.setup() };
}

const MINE = game({
  game_id: 'mp_a',
  name: 'Alpha',
  season: 'Fall',
  year: 1903,
  phase: 'Retreats',
  status: 'active',
  participants: { GERMANY: seat('GERMANY', 'me') },
  finalized_powers: ['GERMANY'],
});

describe('MyGamesSection', () => {
  it('locks a guest out and offers sign-in, with no count', async () => {
    const { props, user, view } = setup({ user: null });
    expect(
      screen.getByText('Account Required to Save & Track Campaigns'),
    ).toBeInTheDocument();
    expect(view.container.querySelector('.lobby-count-badge')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(props.onOpenAuth).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('tells a player with no games where the Host form is', () => {
    const a = setup();
    expect(screen.getByText('0 Games')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Host a public or private campaign on the right, or join/,
      ),
    ).toBeInTheDocument();
    a.view.unmount();
    setup({ hostFormPlace: 'below' });
    expect(
      screen.getByText(/private campaign below, or join/),
    ).toBeInTheDocument();
  });

  it('lists each game with its turn, seat and finalize state', () => {
    setup({ myGames: [MINE] });
    expect(screen.getByText('1 Game')).toBeInTheDocument();
    const row = screen
      .getByText('Alpha')
      .closest('.my-game-row') as HTMLElement;
    expect(within(row).getByText('Fall 1903 · Retreats')).toBeInTheDocument();
    expect(
      within(row).getByText(/Playing as Germany \(Locked\)/),
    ).toBeInTheDocument();
    expect(within(row).getByText('✓ Orders Finalized')).toHaveClass('ready');
    expect(within(row).queryByText('Private')).not.toBeInTheDocument();
    expect(within(row).queryByText('Saved Sandbox')).not.toBeInTheDocument();
  });

  it('shows a pending game, plural count, and the private and sandbox tags', () => {
    setup({
      myGames: [
        game({
          game_id: 'mp_b',
          name: 'Beta',
          is_private: true,
          participants: { FRANCE: seat('FRANCE', 'me') },
        }),
        game({
          game_id: 'sbx',
          name: 'Gamma',
          is_sandbox: true,
          participants: { ITALY: seat('ITALY', 'me') },
        }),
      ],
    });
    expect(screen.getByText('2 Games')).toBeInTheDocument();
    const beta = screen
      .getByText('Beta')
      .closest('.my-game-row') as HTMLElement;
    expect(within(beta).getByText('● Orders Pending')).toHaveClass('pending');
    expect(within(beta).getByText('Private')).toBeInTheDocument();
    const gamma = screen
      .getByText('Gamma')
      .closest('.my-game-row') as HTMLElement;
    expect(within(gamma).getByText('Saved Sandbox')).toBeInTheDocument();
  });

  it('resumes as the seat the player holds', async () => {
    const { props, user } = setup({ myGames: [MINE] });
    await user.click(screen.getByRole('button', { name: /Resume as Germany/ }));
    expect(props.handlePowerSlotClick).toHaveBeenCalledExactlyOnceWith(
      MINE,
      'GERMANY',
    );
  });

  it('leaves with the label and title that match the game', async () => {
    const lobby = game({
      game_id: 'mp_w',
      name: 'Waiting',
      status: 'waiting',
      participants: { ENGLAND: seat('ENGLAND', 'me') },
    });
    const sandbox = game({
      game_id: 'sbx',
      name: 'Saved',
      is_sandbox: true,
      status: 'active',
      participants: { ENGLAND: seat('ENGLAND', 'me') },
    });
    const { props, user } = setup({ myGames: [MINE, lobby, sandbox] });
    const leave = (name: string) =>
      (
        screen.getByText(name).closest('.my-game-row') as HTMLElement
      ).querySelector('.leave-campaign-btn') as HTMLElement;
    expect(leave('Alpha')).toHaveAttribute('title', 'Surrender & leave Alpha');
    expect(leave('Alpha')).toHaveTextContent('Surrender & Leave');
    expect(leave('Waiting')).toHaveAttribute('title', 'Leave Waiting lobby');
    expect(leave('Waiting')).toHaveTextContent('Leave');
    expect(leave('Saved')).toHaveAttribute(
      'title',
      'Delete saved solo sandbox scenario',
    );
    expect(leave('Saved')).toHaveTextContent('Delete');
    await user.click(leave('Waiting'));
    expect(props.onOpenSurrenderModal).toHaveBeenCalledExactlyOnceWith(
      lobby,
      'ENGLAND',
    );
  });

  it('falls back to France when the player holds no seat in a listed game', () => {
    setup({ myGames: [game({ name: 'Odd', participants: {} })] });
    expect(screen.getByText(/Playing as France/)).toBeInTheDocument();
  });
});
