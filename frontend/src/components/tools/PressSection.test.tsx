// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pressStore } from '../../lib/pressStore';
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

  it('sends an anonymous private message as a one-way note', async () => {
    render(<PressSection {...base()} />);
    fill([msg(1, null, 'Watch the Channel', ['FRANCE'])]);
    await tick('GERMANY');
    await userEvent.click(screen.getByTestId('press-anonymous'));
    expect(tab('notes')).toHaveAttribute('data-active', 'true');
    expect(destination()).toBe('Anonymous note to Germany. They cannot reply.');
    expect(bodies()).toEqual(['Watch the Channel']);

    await userEvent.type(screen.getByTestId('press-input'), 'Beware{Enter}');
    expect(lastPost().body).toMatchObject({
      recipients: ['GERMANY'],
      anonymous: true,
    });
    await waitFor(() =>
      expect(bodies()).toEqual(['Watch the Channel', 'Beware']),
    );
    // The player's own note is signed for them only, and names who received it.
    expect(authors()).toEqual(['Anonymous', 'You']);
    const own = screen.getAllByTestId('press-message')[1];
    expect(within(own).getByText('anonymously')).toBeInTheDocument();
    expect(own).toHaveTextContent('to Germany');
  });

  it('asks who receives a note before one can be sent from the notes', async () => {
    render(<PressSection {...base()} />);
    fill([msg(1, null, 'Watch the Channel', ['FRANCE'])]);
    await userEvent.click(tab('notes'));
    expect(screen.getByTestId('press-anonymous')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(destination()).toBe(
      'Pick who receives the anonymous note on the standings above.',
    );
    expect(screen.getByTestId('press-input')).toBeDisabled();
    await tick('ENGLAND');
    expect(screen.getByTestId('press-input')).toBeEnabled();
  });

  it('says where a message goes only when something stops it being sent', async () => {
    render(<PressSection {...base()} />);
    fill([msg(1, null, 'Watch the Channel', ['FRANCE'])]);
    const line = screen.getByTestId('press-destination');
    // Read out with the field, but not drawn.
    expect(line).toHaveAttribute('data-quiet', 'true');
    expect(screen.getByTestId('press-input')).toHaveAccessibleDescription(
      'To everyone, in the public box.',
    );
    await userEvent.click(tab('notes'));
    expect(line).not.toHaveAttribute('data-quiet');
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
        msg(2, 'ENGLAND', 'It was me', ['FRANCE'], { anonymous: true }),
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

    await userEvent.click(tab('notes'));
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
