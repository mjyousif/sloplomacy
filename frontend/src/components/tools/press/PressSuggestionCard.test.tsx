// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestionStore } from '../../../lib/suggestionStore';
import type {
  Order,
  Power,
  PressMessage,
  ProvinceInfo,
} from '../../../types/diplomacy';
import {
  PressSuggestionCard,
  type PressSuggestionCardProps,
} from './PressSuggestionCard';

const move = (
  unit_id: string,
  power: Power,
  origin: string,
  target: string,
): Order => ({
  unit_id,
  power,
  unit_type: 'A',
  origin,
  order_type: 'MOVE',
  target,
  via_convoy: false,
  is_explicit: true,
});
const MESSAGE: PressMessage = {
  id: 'm1',
  seq: 1,
  sender: 'FRANCE',
  anonymous: false,
  recipients: ['GERMANY'],
  body: '',
  sent_at: '2026-11-14T00:00:00Z',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  orders: [
    move('GER_A_MUN', 'GERMANY', 'MUN', 'BUR'),
    move('FRA_A_PAR', 'FRANCE', 'PAR', 'PIC'),
  ],
};
const card = (extra: Partial<PressSuggestionCardProps> = {}) =>
  render(
    <PressSuggestionCard
      message={MESSAGE}
      viewer="GERMANY"
      provinces={{} as Record<string, ProvinceInfo>}
      unitsByProvince={{}}
      turn="Spring 1901 Movement"
      boardFree
      viewingId={null}
      {...extra}
    />,
  );

beforeEach(() => suggestionStore.reset());

describe('PressSuggestionCard', () => {
  it('lists the orders by power, the reader\'s own as "Your units"', () => {
    card();
    expect(screen.getByTestId('suggested-orders-GERMANY')).toHaveTextContent(
      'Your units',
    );
    expect(screen.getByTestId('suggested-orders-GERMANY')).toHaveTextContent(
      'A MUN ──► BUR',
    );
    expect(screen.getByTestId('suggested-orders-FRANCE')).toHaveTextContent(
      'France',
    );
  });

  it('shows the suggestion on the map, and hides it again', async () => {
    const onShowMap = vi.fn();
    const { rerender } = card({ onShowMap });
    await userEvent.click(screen.getByTestId('suggestion-show'));
    expect(suggestionStore.getState().viewing).toBe(MESSAGE);
    expect(onShowMap).toHaveBeenCalled();

    rerender(
      <PressSuggestionCard
        message={MESSAGE}
        viewer="GERMANY"
        provinces={{} as Record<string, ProvinceInfo>}
        unitsByProvince={{}}
        turn="Spring 1901 Movement"
        boardFree
        viewingId="m1"
      />,
    );
    expect(screen.getByTestId('suggestion-show')).toHaveTextContent(
      'Hide from map',
    );
    await userEvent.click(screen.getByTestId('suggestion-show'));
    expect(suggestionStore.getState().viewing).toBeNull();
  });

  it("takes only the orders for the reader's own units", async () => {
    const adopter = vi.fn(async () => null);
    suggestionStore.setAdopter(adopter);
    card();
    await userEvent.click(screen.getByTestId('suggestion-use'));
    expect(adopter).toHaveBeenCalledWith([MESSAGE.orders[0]]);
  });

  it('says why the orders could not be taken', async () => {
    suggestionStore.setAdopter(async () => 'Too late: the game has moved on.');
    card();
    await userEvent.click(screen.getByTestId('suggestion-use'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too late');
  });

  it('offers its sender nothing to take', () => {
    card({ viewer: 'FRANCE' });
    expect(screen.getByTestId('suggestion-show')).toBeEnabled();
    expect(screen.queryByTestId('suggestion-use')).toBeNull();
  });

  it('cannot be used while the board shows something else', () => {
    card({ boardFree: false });
    expect(screen.getByTestId('suggestion-show')).toBeDisabled();
    expect(screen.getByTestId('suggestion-use')).toBeDisabled();
  });

  it('keeps only its text once the turn has passed', () => {
    card({ turn: 'Fall 1901 Movement' });
    expect(screen.getByTestId('suggestion-stale')).toHaveTextContent(
      'Spring 1901',
    );
    expect(screen.queryByTestId('suggestion-show')).toBeNull();
    expect(screen.queryByTestId('suggestion-use')).toBeNull();
    expect(screen.getAllByTestId('suggested-order')).toHaveLength(2);
  });
});
