// @scenario spectate
// @description Watching a match without a seat: a signed-out visitor watches a public game from the lobby browser (units shown, the host's secret move hidden, nothing to order, public press read live but no private press and no composer), picks another power to look at and leaves; a private game is refused on a wrong passcode and watched through Join with code; and a phone visitor watches from the pull-up sheet.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
}

const HOST: Player = {
  id: 'local_watch_host',
  email: 'watch.host@example.com',
  name: 'Hostess',
};
const BOB: Player = {
  id: 'local_watch_bob',
  email: 'watch.bob@example.com',
  name: 'Bob',
};
const PASSCODE = 'e2e-watch';

/** The unsigned token the app sends for a local demo sign-in (see lib/supabase.ts). */
function demoHeaders(player: Player): Record<string, string> {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: player.id, email: player.email })}.`;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function api(player: Player, path: string, body?: object) {
  const res = await fetch(`${DEFAULT_E2E_API_URL}${path}`, {
    method: 'POST',
    headers: demoHeaders(player),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function createGame(name: string, extra: object = {}) {
  const game = await api(HOST, '/api/games', {
    name,
    creator_power: 'FRANCE',
    user_id: HOST.id,
    email: HOST.email,
    display_name: HOST.name,
    ...extra,
  });
  const gameId = game.game_id as string;
  await api(BOB, `/api/games/${gameId}/join`, {
    power: 'GERMANY',
    user_id: BOB.id,
    email: BOB.email,
    display_name: BOB.name,
    passcode: 'passcode' in extra ? PASSCODE : null,
  });
  // The host's secret plan for this turn.
  await api(HOST, `/api/order?game_id=${gameId}`, {
    order: {
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'MOVE',
      target: 'BUR',
      is_explicit: true,
    },
  });
  return gameId;
}

const post = (gameId: string, body: string, recipients: string[] = []) =>
  api(HOST, `/api/press?game_id=${gameId}`, {
    power: 'FRANCE',
    body,
    recipients,
  });

/** The lobby in a browser of its own, signed out. */
async function openLobby(browser: Browser, phone = false): Promise<Page> {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('game-browser')).toBeVisible({
    timeout: 15000,
  });
  return page;
}

const row = (page: Page, gameId: string) =>
  page.getByTestId(`browser-row-${gameId}`);
const secretArrow =
  '[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"][data-order-target="BUR"]';

test.describe('Scenario: Spectate', () => {
  test('a visitor watches public and private games without a seat', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('spectate');
    let guest: Page | null = null;
    let phone: Page | null = null;

    try {
      const tag = Date.now().toString(36).slice(-4);
      const open = await createGame(`Open Watch ${tag}`);
      await post(open, 'Peace in our time');
      await post(open, 'Secret plan for Germany', ['GERMANY']);
      const secret = await createGame(`Private Watch ${tag}`, {
        is_private: true,
        passcode: PASSCODE,
      });

      // 1. A signed-out visitor opens the public game from the browser with Watch. The board
      //    shows every unit, but not the host's secret Paris move, and the order panel lists
      //    France's units under the Watching bar with nothing to finalize.
      guest = await openLobby(browser);
      recorder.attachListeners(guest);
      await expect(row(guest, open)).toBeVisible({ timeout: 15000 });
      await expect(row(guest, secret)).toHaveCount(0);
      await row(guest, open).scrollIntoViewIfNeeded();
      await recorder.recordStep(guest, '00_lobby_watch_button');
      await row(guest, open).getByTestId('browser-row-watch').click();
      await expect(guest.getByTestId('spectator-bar')).toBeVisible({
        timeout: 15000,
      });
      await guest.waitForSelector('[data-testid="unit-token"]');
      await expect(guest.locator(secretArrow)).toHaveCount(0);
      await expect(guest.getByTestId('macro-footer-actions')).toHaveCount(0);
      await expect(
        guest.getByRole('button', { name: "Show France's units" }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        guest.getByTestId('macro-units-scroll-area'),
      ).toHaveAttribute('inert', '');
      await recorder.recordStep(guest, '01_watching_public_game');

      // 2. Public press is there; the private message to Germany is not, and there is no
      //    composer. A new public message arrives live over the socket.
      const press = guest.getByTestId('press-section');
      await expect(press).toContainText('Peace in our time');
      await expect(press).not.toContainText('Secret plan');
      await expect(press.getByRole('textbox')).toHaveCount(0);
      await expect(press).toContainText('only the players can send press');
      await post(open, 'Germany, shall we talk?');
      await expect(press).toContainText('Germany, shall we talk?', {
        timeout: 15000,
      });
      await recorder.recordStep(guest, '02_public_press_live');

      // 3. Another power's units, on this screen only: Italy's seat is free, so it can be
      //    claimed from here (a guest is asked to sign in).
      await guest.getByRole('button', { name: "Show Italy's units" }).click();
      await expect(guest.getByTestId('spectator-claim')).toHaveText(
        /Claim Italy/,
      );
      await guest.getByRole('button', { name: "Show Germany's units" }).click();
      await expect(guest.getByTestId('spectator-claim')).toHaveCount(0);
      await recorder.recordStep(guest, '03_watching_germany');

      // 4. Leave goes back to the lobby, holding no seat.
      await guest.getByTestId('spectator-leave').click();
      await expect(guest.getByTestId('game-browser')).toBeVisible();

      // 5. A private game is watched through Join with code: a wrong passcode is refused,
      //    the right one opens it.
      await guest.getByRole('button', { name: /Join with code/ }).click();
      const dialog = guest.getByTestId('join-with-code-dialog');
      await dialog.getByLabel('Game ID').fill(secret);
      await dialog.getByLabel('Lobby Passcode').fill('wrong');
      await dialog.getByTestId('join-code-watch').click();
      await expect(dialog.getByTestId('join-code-error')).toContainText(
        /passcode is missing or wrong/,
      );
      await recorder.recordStep(guest, '04_private_wrong_passcode');
      await dialog.getByLabel('Lobby Passcode').fill(PASSCODE);
      await dialog.getByTestId('join-code-watch').click();
      await expect(guest.getByTestId('spectator-bar')).toBeVisible({
        timeout: 15000,
      });
      await expect(guest.locator(secretArrow)).toHaveCount(0);
      await recorder.recordStep(guest, '05_watching_private_game');

      // 6. On a phone the order sheet's peek holds the Watching bar and no Finalize.
      phone = await openLobby(browser, true);
      recorder.attachListeners(phone);
      await expect(row(phone, open)).toBeVisible({ timeout: 15000 });
      await row(phone, open).getByTestId('browser-row-watch').click();
      await expect(
        phone.getByTestId('macro-sheet-peek').getByTestId('spectator-bar'),
      ).toBeVisible({ timeout: 15000 });
      await expect(phone.getByTestId('macro-sheet-controls')).toHaveCount(0);
      await expect(phone.locator(secretArrow)).toHaveCount(0);
      await recorder.recordStep(phone, '06_phone_watching');

      recorder.finalize('PASSED');
    } catch (error) {
      const page = phone ?? guest;
      if (page) await recorder.recordStep(page, 'error_state').catch(() => {});
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
