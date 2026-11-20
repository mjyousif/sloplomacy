import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { LobbyGameRow } from '../types/diplomacy';
import { LobbyView } from './LobbyView';
import { browseFetch, browsePage, game, ME, seat } from './lobby/lobby.testkit';

export function stubMatchMedia(compact: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: compact,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

/** Answers the game browser's requests with these public rows; returns the fetch stub. */
export function stubBrowse(rows: LobbyGameRow[] = []) {
  const fetchMock = browseFetch(() => browsePage(rows));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Call from `beforeEach` / `afterEach` of each LobbyView test file. */
export function resetLobbyEnv() {
  stubMatchMedia(false);
  stubBrowse();
}

export type Props = React.ComponentProps<typeof LobbyView>;
export function setup(over: Partial<Props> = {}) {
  const props: Props = {
    user: ME,
    games: [],
    loadingGames: false,
    onRefreshGames: vi.fn(),
    onEnterSandbox: vi.fn(),
    onOpenAuth: vi.fn(),
    onWatchGame: vi.fn(async () => {}),
    onCreateGame: vi.fn(async () => {}),
    onJoinOrEnterGame: vi.fn(async () => {}),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const user = userEvent.setup();
  const view = render(<LobbyView {...props} />);
  return { props, user, view };
}

/** Opens the Host dialog from the action row. */
export const openHost = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Host game' }));
/** Opens the Join with code dialog from the action row. */
export const openJoin = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Join with code' }));
export const hostDialog = () => screen.queryByTestId('host-game-dialog');
export const joinDialog = () => screen.queryByTestId('join-with-code-dialog');

export const OPEN = game({ game_id: 'mp_open', name: 'Open Table' });
export const SECRET = game({
  game_id: 'mp_sec',
  name: 'Secret Table',
  is_private: true,
  has_passcode: true,
});
export const MINE = game({
  game_id: 'mp_mine',
  name: 'My Table',
  has_passcode: true,
  participants: { AUSTRIA: seat('AUSTRIA', 'me') },
});
export const SANDBOX = game({
  game_id: 'sbx',
  name: 'Saved Study',
  is_sandbox: true,
  participants: { ITALY: seat('ITALY', 'me') },
});
/** The game browser's row for a game, once its page has loaded. */
export const browserRow = (gameId: string) =>
  screen.findByTestId(`browser-row-${gameId}`);
