import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { LobbyView } from './LobbyView';
import { game, ME, seat } from './lobby/lobby.testkit';

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

/** Call from `beforeEach` / `afterEach` of each LobbyView test file. */
export function resetLobbyEnv() {
  stubMatchMedia(false);
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
    onCreateGame: vi.fn(async () => {}),
    onJoinOrEnterGame: vi.fn(async () => {}),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const user = userEvent.setup();
  const view = render(<LobbyView {...props} />);
  return { props, user, view };
}

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
export const card = (name: string) =>
  screen.getByText(name).closest('.lobby-game-card') as HTMLElement;
