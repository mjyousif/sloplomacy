// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MultiplayerGameSummary } from '../../types/diplomacy';
import {
  FeaturedGameHero,
  type FeaturedGameHeroProps,
} from './FeaturedGameHero';
import { game, ME, seat } from './lobby.testkit';

const NOW = Date.parse('2026-11-15T12:00:00Z');

const LIVE = game({
  game_id: 'mp_live',
  name: 'Concert of Vienna',
  status: 'active',
  season: 'Fall',
  year: 1902,
  phase: 'Movement',
  participants: {
    FRANCE: seat('FRANCE', 'me'),
    ITALY: seat('ITALY', 'u2'),
    RUSSIA: seat('RUSSIA', 'u3'),
  },
  finalized_powers: ['ITALY'],
  deadline: NOW / 1000 + 14 * 3600 + 300,
  board: {
    ownership: { PAR: 'FRANCE', MAR: 'FRANCE', BRE: 'FRANCE', BUR: 'FRANCE' },
    units: [{ power: 'FRANCE', unit_type: 'A', province: 'PAR' }],
  },
});

function setup(
  over: Partial<MultiplayerGameSummary> = {},
  props: Partial<FeaturedGameHeroProps> = {},
) {
  const all: FeaturedGameHeroProps = {
    user: ME,
    game: { ...LIVE, ...over },
    nowMs: NOW,
    onEnterGame: vi.fn(),
    onOpenSurrenderModal: vi.fn(),
    ...props,
  };
  render(<FeaturedGameHero {...all} />);
  return all;
}

describe('FeaturedGameHero', () => {
  it('shows the board beside what the game is waiting for', () => {
    setup();
    const hero = screen.getByTestId('featured-game-hero');
    expect(hero).toHaveAttribute('data-urgency', 'your-move');
    expect(screen.getByTestId('hero-status')).toHaveTextContent('Your move');
    expect(screen.getByTestId('hero-game-name')).toHaveTextContent(
      'Concert of Vienna',
    );
    expect(within(hero).getByText('Fall 1902 · Movement')).toBeInTheDocument();
    // Burgundy is coloured French but is no supply center, so it is not counted.
    expect(screen.getByTestId('hero-seat')).toHaveTextContent(
      'You are France · 3 centers',
    );
    expect(screen.getByTestId('hero-progress')).toHaveTextContent(
      'Due in 14h · 1 of 3 finalized',
    );
    expect(
      screen.getByRole('img', { name: 'Board of Concert of Vienna' }),
    ).toHaveAttribute('data-has-board', 'true');
    expect(screen.getByTestId('mini-map-unit')).toHaveAttribute(
      'data-mine',
      'true',
    );
    expect(screen.queryByTestId('hero-no-board')).toBeNull();
  });

  it('resumes as the seat the player holds', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Resume as France' }));
    expect(props.onEnterGame).toHaveBeenCalledExactlyOnceWith(
      props.game,
      'FRANCE',
    );
  });

  it('keeps leaving behind the ⋯ menu', () => {
    const props = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'More actions for Concert of Vienna',
      }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Surrender & Leave' }),
    );
    expect(props.onOpenSurrenderModal).toHaveBeenCalledExactlyOnceWith(
      props.game,
      'FRANCE',
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(props.onEnterGame).not.toHaveBeenCalled();
  });

  it('closes the ⋯ menu on Escape (restoring focus) and on a press outside it', () => {
    setup();
    const more = screen.getByTestId('game-actions-btn');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more).toHaveFocus();
    fireEvent.click(more);
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows no deadline for an untimed game, and one center in the singular', () => {
    setup({
      deadline: null,
      finalized_powers: ['FRANCE', 'ITALY'],
      board: { ownership: { PAR: 'FRANCE' }, units: [] },
    });
    expect(screen.getByTestId('hero-status')).toHaveTextContent(
      'Waiting on others',
    );
    expect(screen.getByTestId('hero-progress')).toHaveTextContent(
      /^2 of 3 finalized$/,
    );
    expect(screen.getByTestId('hero-seat')).toHaveTextContent(
      'You are France · 1 center',
    );
  });

  it('says so when a game has no board yet, and leaves the centers out', () => {
    setup({ board: null });
    expect(screen.getByTestId('hero-no-board')).toBeInTheDocument();
    expect(screen.getByTestId('mini-map')).toHaveAttribute(
      'data-has-board',
      'false',
    );
    expect(screen.getByTestId('hero-seat')).toHaveTextContent('You are France');
    expect(screen.getByTestId('hero-seat')).not.toHaveTextContent('center');
  });

  it('turns to the past tense for a finished game, with no clock or progress', () => {
    const props = setup({ status: 'completed', winner: 'ITALY' });
    expect(screen.getByTestId('featured-game-hero')).toHaveAttribute(
      'data-urgency',
      'finished',
    );
    expect(screen.getByTestId('hero-status')).toHaveTextContent(
      'Finished · see the result',
    );
    expect(screen.getByTestId('hero-seat')).toHaveTextContent(
      'You were France',
    );
    expect(screen.queryByTestId('hero-progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review board' }));
    expect(props.onEnterGame).toHaveBeenCalledTimes(1);
  });

  it('tags a private campaign', () => {
    setup({ is_private: true });
    expect(screen.getByTestId('hero-game-name')).toHaveTextContent('Private');
  });
});
