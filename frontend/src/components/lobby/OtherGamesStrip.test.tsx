// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { game, ME, seat } from './lobby.testkit';
import { OtherGamesStrip, type OtherGamesStripProps } from './OtherGamesStrip';

const BOARD = {
  ownership: { VIE: 'AUSTRIA' as const },
  units: [
    { power: 'AUSTRIA' as const, unit_type: 'A' as const, province: 'VIE' },
  ],
};

const WAITING = game({
  game_id: 'mp_wait',
  name: 'Balkan Powder Keg',
  status: 'active',
  season: 'Fall',
  year: 1901,
  participants: { AUSTRIA: seat('AUSTRIA', 'me') },
  finalized_powers: ['AUSTRIA'],
  board: BOARD,
});
const MOVE = game({
  game_id: 'mp_move',
  name: 'The Quiet Cabal',
  status: 'waiting',
  participants: { ITALY: seat('ITALY', 'me') },
});
const SANDBOX = game({
  game_id: 'saved_1',
  name: 'Saved Study',
  is_sandbox: true,
  participants: { ITALY: seat('ITALY', 'me') },
});

function setup(over: Partial<OtherGamesStripProps> = {}) {
  const props: OtherGamesStripProps = {
    user: ME,
    games: [MOVE, WAITING, SANDBOX],
    onEnterGame: vi.fn(),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const view = render(<OtherGamesStrip {...props} />);
  return { props, view };
}

const card = (name: string) =>
  screen.getByText(name).closest('[data-testid="my-game-card"]') as HTMLElement;

describe('OtherGamesStrip', () => {
  it('draws nothing when the hero has the only game and no sandbox launcher is given', () => {
    const { view } = setup({ games: [] });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('draws the Open local sandbox outline card when onEnterSandbox is provided', () => {
    const onEnterSandbox = vi.fn();
    setup({ games: [], onEnterSandbox });
    const btn = screen.getByTestId('open-local-sandbox-card');
    expect(btn).toHaveTextContent('Open local sandbox');
    fireEvent.click(btn);
    expect(onEnterSandbox).toHaveBeenCalledTimes(1);
  });

  it('draws a card per game, in the order given, with its status and turn', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Your other games' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('my-game-name').map((n) => n.textContent),
    ).toEqual(['The Quiet Cabal', 'Balkan Powder Keg', 'Saved Study']);
    expect(
      screen.getAllByTestId('my-game-card').map((c) => c.dataset.urgency),
    ).toEqual(['your-move', 'waiting', 'sandbox']);
    const waiting = card('Balkan Powder Keg');
    expect(within(waiting).getByTestId('my-game-status')).toHaveTextContent(
      'Waiting on others',
    );
    expect(within(waiting).getByText('Fall 1901 · Movement')).toBeVisible();
  });

  it('shows the phase clock under a live game, and nothing for an untimed one', () => {
    const nowMs = 1_000_000_000_000;
    const timed = { ...WAITING, deadline: nowMs / 1000 + 5 * 3600 };
    setup({ games: [timed, MOVE], nowMs });
    expect(
      within(card('Balkan Powder Keg')).getByTestId('my-game-due'),
    ).toHaveTextContent('Due in 5h');
    expect(
      within(card('The Quiet Cabal')).queryByTestId('my-game-due'),
    ).toBeNull();
  });

  it('gives a game a thumbnail without units, and a sandbox with no board an icon', () => {
    setup();
    const map = within(card('Balkan Powder Keg')).getByTestId('mini-map');
    expect(map).toHaveAttribute('data-has-board', 'true');
    expect(screen.queryByTestId('mini-map-unit')).toBeNull();
    // A game with no board yet still gets the bare map; only a sandbox gets the flask.
    expect(
      within(card('The Quiet Cabal')).getByTestId('mini-map'),
    ).toHaveAttribute('data-has-board', 'false');
    expect(within(card('Saved Study')).queryByTestId('mini-map')).toBeNull();
  });

  it('enters a game as the seat the player holds', () => {
    const { props } = setup();
    fireEvent.click(
      within(card('Balkan Powder Keg')).getByRole('button', {
        name: 'Resume as Austria',
      }),
    );
    expect(props.onEnterGame).toHaveBeenCalledExactlyOnceWith(
      WAITING,
      'AUSTRIA',
    );
    fireEvent.click(
      within(card('Saved Study')).getByRole('button', {
        name: 'Open sandbox',
      }),
    );
    expect(props.onEnterGame).toHaveBeenLastCalledWith(SANDBOX, 'ITALY');
  });

  it('labels the ⋯ menu entry for the kind of game', () => {
    const { props } = setup();
    const labelIn = (name: string) => {
      fireEvent.click(
        screen.getByRole('button', { name: `More actions for ${name}` }),
      );
      const item = screen.getByRole('menuitem');
      const text = item.textContent;
      fireEvent.click(item);
      return text;
    };
    expect(labelIn('Balkan Powder Keg')).toBe('Surrender & Leave');
    expect(props.onOpenSurrenderModal).toHaveBeenLastCalledWith(
      WAITING,
      'AUSTRIA',
    );
    expect(labelIn('The Quiet Cabal')).toBe('Leave');
    expect(labelIn('Saved Study')).toBe('Delete');
    expect(props.onOpenSurrenderModal).toHaveBeenCalledTimes(3);
    expect(props.onEnterGame).not.toHaveBeenCalled();
  });
});
