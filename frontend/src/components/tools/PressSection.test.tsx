// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pressStore } from '../../lib/pressStore';
import { suggestionStore } from '../../lib/suggestionStore';
import type { Power, PressMessage, ProvinceInfo } from '../../types/diplomacy';
import { threadKey } from '../../utils/pressHelpers';
import { PressSection, type PressSectionProps } from './PressSection';

const authedFetch = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({ authedFetch }));

const msg = (
  seq: number,
  sender: Power | null,
  body: string,
  recipients: Power[] = [],
  extra: Partial<PressMessage> = {},
): PressMessage => ({
  id: `m${seq}`,
  seq,
  sender,
  anonymous: sender === null,
  recipients,
  body,
  sent_at: '2026-11-13T12:00:00+00:00',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  orders: [],
  ...extra,
});

const PROVINCES = {
  BUR: { id: 'BUR', name: 'Burgundy' },
  BEL: { id: 'BEL', name: 'Belgium' },
} as unknown as Record<string, ProvinceInfo>;

const base = (extra: Partial<PressSectionProps> = {}): PressSectionProps => ({
  gameId: 'g1',
  power: 'FRANCE',
  gameOver: false,
  surrendered: false,
  provinces: PROVINCES,
  units: [],
  turn: 'Spring 1901 Movement',
  suggestTurn: 'Spring 1901 Movement',
  onHighlightProvinces: vi.fn(),
  ...extra,
});

const fill = (messages: PressMessage[], revealed = false) =>
  act(() => {
    pressStore.open('g1', 'FRANCE');
    pressStore.setFeed('g1', { power: 'FRANCE', revealed, messages });
  });

const bodies = () =>
  screen
    .queryAllByTestId('press-message')
    .map((m) => m.querySelector('p')?.textContent);
const authors = () =>
  screen.queryAllByTestId('press-author').map((a) => a.textContent);
const destination = () => screen.getByTestId('press-destination').textContent;
const tab = (key: string) => screen.getByTestId(`press-channel-${key}`);
/** Picks a country the way its letter button on the standings does. */
const tick = async (power: Power) =>
  act(() => pressStore.toggleRecipient(power));
const picked = () => pressStore.getState().recipients;
const lastPost = () => {
  const [url, init] = authedFetch.mock.calls[authedFetch.mock.calls.length - 1];
  return { url, body: JSON.parse(init.body) };
};

beforeEach(() => {
  localStorage.clear();
  pressStore.reset();
  suggestionStore.reset();
  authedFetch.mockReset();
  authedFetch.mockImplementation(async (_url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => {
      const req = JSON.parse(String(init.body));
      return msg(99, req.power, req.body, req.recipients, {
        anonymous: req.anonymous,
      });
    },
  }));
});

describe('PressSection', () => {
  it('shows the public box first, with who wrote each message', () => {
    render(<PressSection {...base()} />);
    fill([
      msg(1, 'GERMANY', 'Peace in the west'),
      msg(2, null, 'Somebody lies'),
      msg(3, 'FRANCE', 'Agreed'),
      msg(4, 'GERMANY', 'For your eyes', ['FRANCE']),
    ]);
    expect(bodies()).toEqual(['Peace in the west', 'Somebody lies', 'Agreed']);
    expect(authors()).toEqual(['Germany', 'Anonymous', 'You']);
    expect(destination()).toBe('To everyone, in the public box.');
  });

  it('posts to the public box, signed, when nothing is ticked', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.type(screen.getByTestId('press-input'), 'Hello Europe');
    await userEvent.click(screen.getByTestId('press-send'));
    expect(lastPost()).toEqual({
      url: '/api/press?game_id=g1',
      body: {
        power: 'FRANCE',
        recipients: [],
        anonymous: false,
        body: 'Hello Europe',
      },
    });
    await waitFor(() => expect(bodies()).toEqual(['Hello Europe']));
    expect(screen.getByTestId('press-input')).toHaveValue('');
  });

  it('sends on Enter, and Shift+Enter starts a new line instead', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    const input = screen.getByTestId('press-input');
    await userEvent.type(input, 'one{Shift>}{Enter}{/Shift}two');
    expect(authedFetch).not.toHaveBeenCalled();
    await userEvent.type(input, '{Enter}');
    expect(lastPost().body.body).toBe('one\ntwo');
  });

  it('opens the thread of exactly the countries picked on the standings', async () => {
    render(<PressSection {...base()} />);
    fill([
      msg(1, 'GERMANY', 'Just us', ['FRANCE']),
      msg(2, 'ENGLAND', 'All three', ['FRANCE', 'GERMANY']),
    ]);
    await tick('GERMANY');
    expect(bodies()).toEqual(['Just us']);
    expect(destination()).toBe('Private to Germany.');
    expect(tab('FRANCE+GERMANY')).toHaveAttribute('data-active', 'true');

    await tick('ENGLAND');
    expect(bodies()).toEqual(['All three']);
    expect(tab(threadKey(['ENGLAND', 'FRANCE', 'GERMANY']))).toHaveAttribute(
      'data-active',
      'true',
    );

    await userEvent.type(screen.getByTestId('press-input'), 'Pact?{Enter}');
    expect(lastPost().body).toMatchObject({
      recipients: ['GERMANY', 'ENGLAND'],
      anonymous: false,
    });
  });

  it('picks the members of a thread opened from its chip', async () => {
    render(<PressSection {...base()} />);
    fill([msg(1, 'GERMANY', 'Just us', ['FRANCE'])]);
    await userEvent.click(tab('FRANCE+GERMANY'));
    expect(picked()).toEqual(['GERMANY']);
    expect(bodies()).toEqual(['Just us']);
    await userEvent.click(tab('public'));
    expect(picked()).toEqual([]);
  });

  it('posts anonymously in the group thread that is open', async () => {
    const group = threadKey(['ENGLAND', 'FRANCE', 'GERMANY']);
    render(<PressSection {...base()} />);
    // The server lists the whole thread while an anonymous author is hidden.
    fill([msg(1, null, 'Watch the Channel', ['ENGLAND', 'FRANCE', 'GERMANY'])]);
    await tick('GERMANY');
    await tick('ENGLAND');
    expect(tab(group)).toHaveAttribute('data-active', 'true');
    await userEvent.click(screen.getByTestId('press-anonymous'));
    // Still the same thread, now unsigned.
    expect(tab(group)).toHaveAttribute('data-active', 'true');
    expect(destination()).toBe(
      'Unsigned, to the thread with Germany, England.',
    );
    expect(bodies()).toEqual(['Watch the Channel']);

    await userEvent.type(screen.getByTestId('press-input'), 'Beware{Enter}');
    expect(lastPost().body).toMatchObject({
      recipients: ['GERMANY', 'ENGLAND'],
      anonymous: true,
    });
    await waitFor(() =>
      expect(bodies()).toEqual(['Watch the Channel', 'Beware']),
    );
    // The player's own message is signed for them only.
    expect(authors()).toEqual(['Anonymous', 'You']);
    const own = screen.getAllByTestId('press-message')[1];
    expect(within(own).getByText('anonymously')).toBeInTheDocument();
    expect(screen.queryByTestId('press-channel-notes')).toBeNull();
  });

  it('turns the mask off in a one-to-one thread, where the other player would know', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.click(screen.getByTestId('press-anonymous'));
    await tick('GERMANY');
    const mask = screen.getByTestId('press-anonymous');
    expect(mask).toBeDisabled();
    expect(mask).toHaveAttribute('aria-pressed', 'false');
    expect(mask).toHaveAttribute(
      'title',
      expect.stringContaining('the other player would know'),
    );
    expect(destination()).toBe('Private to Germany.');
    await userEvent.type(screen.getByTestId('press-input'), 'Hi{Enter}');
    expect(lastPost().body).toMatchObject({
      recipients: ['GERMANY'],
      anonymous: false,
    });
    // A third country brings the choice back.
    await tick('ENGLAND');
    expect(screen.getByTestId('press-anonymous')).toBeEnabled();
    expect(screen.getByTestId('press-anonymous')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says where a message goes only when something stops it being sent', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    const line = screen.getByTestId('press-destination');
    // Read out with the field, but not drawn.
    expect(line).toHaveAttribute('data-quiet', 'true');
    expect(screen.getByTestId('press-input')).toHaveAccessibleDescription(
      'To everyone, in the public box.',
    );
    // Paste, not type: 1001 keystrokes time out on a slow runner, and the
    // abandoned typing then leaks into the next test's field.
    await userEvent.click(screen.getByTestId('press-input'));
    await userEvent.paste('x'.repeat(1001));
    expect(line).not.toHaveAttribute('data-quiet');
  });

  it('marks the field while writing anonymously', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.click(screen.getByTestId('press-anonymous'));
    expect(screen.getByTestId('press-input')).toHaveAttribute(
      'placeholder',
      'Write anonymously…',
    );
  });

  it('posts anonymously to the public box when nobody is ticked', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.click(screen.getByTestId('press-anonymous'));
    expect(tab('public')).toHaveAttribute('data-active', 'true');
    expect(destination()).toBe('To everyone, unsigned.');
    await userEvent.type(screen.getByTestId('press-input'), 'Rumour{Enter}');
    expect(lastPost().body).toMatchObject({ recipients: [], anonymous: true });
  });

  it('opens itself when a country is picked while it is folded', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.click(screen.getByTestId('sidebar-section-toggle'));
    expect(screen.queryByTestId('press-section')).toBeNull();
    await tick('GERMANY');
    expect(destination()).toBe('Private to Germany.');
  });

  it('counts unread per conversation and clears it when the conversation is opened', async () => {
    render(<PressSection {...base()} />);
    fill([
      msg(1, 'GERMANY', 'Public'),
      msg(2, 'GERMANY', 'Private one', ['FRANCE']),
      msg(3, 'GERMANY', 'Private two', ['FRANCE']),
    ]);
    // The public box is on screen, so it is read at once.
    expect(within(tab('public')).queryByTestId('press-unread')).toBeNull();
    expect(
      within(tab('FRANCE+GERMANY')).getByTestId('press-unread'),
    ).toHaveTextContent('2');
    expect(screen.getByTestId('press-unread-total')).toHaveTextContent('2');

    await userEvent.click(tab('FRANCE+GERMANY'));
    expect(screen.queryByTestId('press-unread-total')).toBeNull();
    expect(pressStore.getState().lastRead).toEqual({
      public: 1,
      'FRANCE+GERMANY': 3,
    });
  });

  it('marks nothing read while it cannot be seen', () => {
    render(<PressSection {...base({ visible: false })} />);
    fill([msg(1, 'GERMANY', 'Public')]);
    expect(screen.getByTestId('press-unread-total')).toHaveTextContent('1');
    expect(pressStore.getState().lastRead).toEqual({});
  });

  it('links provinces to the map', async () => {
    const onHighlightProvinces = vi.fn();
    const onProvincePicked = vi.fn();
    render(
      <PressSection {...base({ onHighlightProvinces, onProvincePicked })} />,
    );
    fill([msg(1, 'GERMANY', 'Support me into BEL, not burgundy')]);
    const links = screen.getAllByTestId('press-province-link');
    expect(links.map((l) => l.getAttribute('data-province'))).toEqual([
      'BEL',
      'BUR',
    ]);
    await userEvent.click(links[0]);
    expect(onHighlightProvinces).toHaveBeenLastCalledWith(['BEL']);
    expect(onProvincePicked).toHaveBeenCalledTimes(1);
  });

  it("shows the server's reason when a message is refused, and keeps the draft", async () => {
    authedFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        detail: 'You are sending messages too quickly. Wait a moment.',
      }),
    });
    render(<PressSection {...base()} />);
    fill([]);
    await userEvent.type(screen.getByTestId('press-input'), 'Spam{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('too quickly');
    expect(screen.getByTestId('press-input')).toHaveValue('Spam');
  });

  it('after the game shows every thread and author, and only the public box stays open', async () => {
    render(<PressSection {...base({ gameOver: true })} />);
    fill(
      [
        msg(1, 'GERMANY', 'Stab France in the fall', ['ENGLAND']),
        msg(2, 'ENGLAND', 'It was me', ['FRANCE', 'GERMANY'], {
          anonymous: true,
        }),
      ],
      true,
    );
    // Private and anonymous press are closed.
    expect(screen.queryByTestId('press-anonymous')).toBeNull();
    expect(screen.getByTestId('press-input')).toBeEnabled();

    await userEvent.click(tab(threadKey(['ENGLAND', 'GERMANY'])));
    expect(bodies()).toEqual(['Stab France in the fall']);
    expect(screen.getByTestId('press-channel-caption')).toHaveTextContent(
      'Private thread between England, Germany (revealed)',
    );
    expect(screen.getByTestId('press-input')).toBeDisabled();

    await userEvent.click(tab(threadKey(['ENGLAND', 'FRANCE', 'GERMANY'])));
    expect(authors()).toEqual(['England']);
  });

  it('lets a surrendered player read but not write', () => {
    render(<PressSection {...base({ surrendered: true })} />);
    fill([msg(1, 'GERMANY', 'Farewell')]);
    expect(bodies()).toEqual(['Farewell']);
    expect(screen.getByTestId('press-input')).toBeDisabled();
    expect(destination()).toContain('You surrendered');
  });
});

describe('PressSection: move suggestions', () => {
  const lamp = () => screen.queryByTestId('press-suggest');
  const order = {
    unit_id: 'GER_A_MUN',
    power: 'GERMANY' as Power,
    unit_type: 'A' as const,
    origin: 'MUN',
    order_type: 'MOVE' as const,
    target: 'BUR',
    via_convoy: false,
    is_explicit: true,
  };

  it('offers the lamp only in a signed private thread, during a Movement turn', async () => {
    const { rerender } = render(<PressSection {...base()} />);
    fill([]);
    expect(lamp()).toBeNull();
    await tick('GERMANY');
    await tick('ENGLAND');
    expect(lamp()).not.toBeNull();
    await userEvent.click(screen.getByTestId('press-anonymous'));
    expect(lamp()).toBeNull();
    await userEvent.click(screen.getByTestId('press-anonymous'));
    rerender(<PressSection {...base({ suggestTurn: null })} />);
    expect(lamp()).toBeNull();
  });

  it('starts a draft for the thread, and sends its orders with a message that needs no text', async () => {
    const onProvincePicked = vi.fn();
    render(<PressSection {...base({ onProvincePicked })} />);
    fill([]);
    await tick('GERMANY');
    await userEvent.click(screen.getByTestId('press-suggest'));
    expect(suggestionStore.getState().draft).toMatchObject({
      members: ['GERMANY'],
      turn: 'Spring 1901 Movement',
    });
    // The phone closes its drawer to show the map.
    expect(onProvincePicked).toHaveBeenCalled();
    expect(screen.getByTestId('press-suggestion-draft')).toBeInTheDocument();
    // The mask is put away: a suggestion is always signed.
    expect(screen.queryByTestId('press-anonymous')).toBeNull();
    expect(screen.getByTestId('press-send')).toBeDisabled();

    act(() => suggestionStore.stageOrder(order));
    expect(screen.getAllByTestId('suggested-order')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('press-send'));
    expect(lastPost().body).toEqual({
      power: 'FRANCE',
      recipients: ['GERMANY'],
      anonymous: false,
      body: '',
      orders: [order],
    });
    await waitFor(() => expect(suggestionStore.getState().draft).toBeNull());
  });

  it('does not send an order that is not finished', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await tick('GERMANY');
    await userEvent.click(screen.getByTestId('press-suggest'));
    act(() => suggestionStore.stageOrder({ ...order, target: null }));
    await userEvent.type(screen.getByTestId('press-input'), 'Hello');
    expect(screen.getByTestId('press-send')).toBeDisabled();
    await userEvent.click(
      within(screen.getByTestId('press-suggestion-draft')).getByRole('button', {
        name: /^Remove/,
      }),
    );
    expect(screen.getByTestId('press-send')).toBeEnabled();
  });

  it('discards the draft when other countries are picked, so it reaches nobody else', async () => {
    render(<PressSection {...base()} />);
    fill([]);
    await tick('GERMANY');
    await userEvent.click(screen.getByTestId('press-suggest'));
    act(() => suggestionStore.stageOrder(order));
    await tick('ENGLAND');
    await waitFor(() => expect(suggestionStore.getState().draft).toBeNull());
    expect(screen.queryByTestId('press-suggestion-draft')).toBeNull();
  });
});
