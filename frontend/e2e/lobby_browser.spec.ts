// @scenario lobby_browser
// @description Lobby game browser with two players: open-seat, country, turn and full filters, a private campaign never listed, a signed-in player claiming a seat from an opened row and then seeing Resume, and a guest on a phone watching that seat turn taken live and being asked to sign in to claim.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
}

const HOST: Player = {
  id: 'local_browser_host',
  email: 'browser.host@example.com',
  name: 'Hostess',
};
const BOB: Player = {
  id: 'local_browser_bob',
  email: 'browser.bob@example.com',
  name: 'Bob',
};
/** Seats the full game; never opens a browser. */
const filler = (i: number): Player => ({
  id: `local_browser_p${i}`,
  email: `browser.p${i}@example.com`,
  name: `P${i}`,
});

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

async function createGame(name: string, power: string, extra: object = {}) {
  const game = await api(HOST, '/api/games', {
    name,
    creator_power: power,
    user_id: HOST.id,
    email: HOST.email,
    display_name: HOST.name,
    ...extra,
  });
  return game.game_id as string;
}

/** The lobby in a browser of its own: signed in as `player`, or a guest. */
async function openLobby(
  browser: Browser,
  player: Player | null,
  phone = false,
): Promise<Page> {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 1440, height: 900 } },
  );
  if (player) {
    await context.addInitScript((user) => {
      localStorage.setItem(
        'diplomacy_1901_local_auth_user',
        JSON.stringify({
          id: user.id,
          email: user.email,
          displayName: user.name,
          isLocalDemo: true,
        }),
      );
    }, player);
  }
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('game-browser')).toBeVisible({
    timeout: 15000,
  });
  return page;
}

const row = (page: Page, gameId: string) =>
  page.getByTestId(`browser-row-${gameId}`);
const seat = (page: Page, gameId: string, power: string) =>
  row(page, gameId).getByTestId(`seat-${power}`);
/** Puts the top of an element at the top of the view, so a screenshot shows what follows. */
const scrollToTop = (page: Page, testId: string) =>
  page
    .getByTestId(testId)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
const clearFilters = (page: Page) =>
  page.getByRole('button', { name: /Clear filters/ }).click();

test.describe('Scenario: Lobby game browser', () => {
  test('two players browse, filter, claim and resume public games', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('lobby_browser');
    let bob: Page | null = null;
    let guest: Page | null = null;

    try {
      const tag = Date.now().toString(36).slice(-4);
      const open = await createGame(`Open Table ${tag}`, 'FRANCE');
      const italian = await createGame(`Italian Front ${tag}`, 'ITALY');
      const moved = await createGame(`Fall Campaign ${tag}`, 'GERMANY');
      await api(HOST, `/api/adjudicate?game_id=${moved}`);
      const full = await createGame(`Packed House ${tag}`, 'AUSTRIA');
      const others = [
        'ENGLAND',
        'FRANCE',
        'GERMANY',
        'ITALY',
        'RUSSIA',
        'TURKEY',
      ];
      for (const [i, power] of others.entries()) {
        const p = filler(i);
        await api(p, `/api/games/${full}/join`, {
          power,
          user_id: p.id,
          email: p.email,
          display_name: p.name,
        });
      }
      const secret = await createGame(`Hidden Cabal ${tag}`, 'RUSSIA', {
        is_private: true,
        passcode: 'e2e-secret',
      });

      // 1. Bob sees the open public games, the most recently played first, each a compact
      //    row with its seven seats. The full and the private game are not listed.
      bob = await openLobby(browser, BOB);
      recorder.attachListeners(bob);
      await expect(row(bob, open)).toBeVisible({ timeout: 15000 });
      await expect(row(bob, italian)).toBeVisible();
      await expect(row(bob, moved)).toContainText('F1901 Moves');
      await expect(row(bob, full)).toHaveCount(0);
      await expect(row(bob, secret)).toHaveCount(0);
      await expect(
        bob.getByTestId('browser-list').locator('> li').first(),
      ).toHaveAttribute('data-testid', `browser-row-${moved}`);
      await expect(seat(bob, open, 'FRANCE')).toHaveAttribute(
        'data-seat',
        'taken',
      );
      await expect(seat(bob, open, 'ITALY')).toHaveAttribute(
        'data-seat',
        'free',
      );
      await expect(
        row(bob, open).getByRole('button', { name: /Claim/ }),
      ).toHaveCount(0);
      await scrollToTop(bob, 'game-browser');
      await recorder.recordStep(bob, '01_desktop_open_games');

      // 2. Only games where Italy is still free.
      await bob.getByTitle('Italy must be unclaimed').click();
      await expect(row(bob, italian)).toHaveCount(0);
      await expect(row(bob, open)).toBeVisible();
      await recorder.recordStep(bob, '02_filter_italy_open');

      // 3. Only games after Spring 1901.
      await clearFilters(bob);
      await bob.getByLabel('Turn comparison').selectOption('after');
      await bob.getByLabel('Turn season').selectOption('Spring');
      await bob.getByLabel('Turn year').fill('1901');
      await expect(row(bob, open)).toHaveCount(0);
      await expect(row(bob, moved)).toBeVisible();
      await recorder.recordStep(bob, '03_filter_after_spring_1901');

      // 4. Full games: listed, but there is nothing to join.
      await clearFilters(bob);
      await bob
        .getByTestId('browser-filters')
        .getByRole('button', { name: 'Full', exact: true })
        .click();
      await expect(row(bob, full)).toBeVisible();
      await expect(
        row(bob, full).getByRole('button', { name: 'Full' }),
      ).toBeDisabled();
      await expect(row(bob, open)).toHaveCount(0);
      await recorder.recordStep(bob, '04_full_games');
      await clearFilters(bob);

      // 5. A guest on a phone has the lobby open on the same game.
      guest = await openLobby(browser, null, true);
      recorder.attachListeners(guest);
      await expect(guest.locator('[data-layout="compact"]')).toHaveCount(1);
      await expect(seat(guest, open, 'ITALY')).toHaveAttribute(
        'data-seat',
        'free',
        { timeout: 15000 },
      );

      // 6. Bob opens the row into its seats and claims Italy, which enters the game.
      await row(bob, open).getByRole('button', { name: 'Join' }).click();
      await expect(
        row(bob, open).getByRole('button', { name: /France\s*Taken/ }),
      ).toBeDisabled();
      await scrollToTop(bob, 'browser-filters');
      await recorder.recordStep(bob, '05_row_open_with_seats');
      await row(bob, open)
        .getByRole('button', { name: /Claim Italy/ })
        .click();
      await bob.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      // 7. The guest's page turns Italy taken without a reload.
      await expect(seat(guest, open, 'ITALY')).toHaveAttribute(
        'data-seat',
        'taken',
        { timeout: 15000 },
      );
      await scrollToTop(guest, 'browser-list');
      const width = await guest.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(width.scroll).toBeLessThanOrEqual(width.inner);
      await recorder.recordStep(guest, '06_phone_seat_taken_live');

      // 8. The guest opens the row; claiming asks them to sign in.
      await row(guest, open).getByRole('button', { name: 'Join' }).click();
      await expect(
        row(guest, open).getByRole('button', { name: /Italy\s*Taken/ }),
      ).toBeDisabled();
      await recorder.recordStep(guest, '07_phone_row_open');
      await row(guest, open)
        .getByRole('button', { name: /Claim Turkey/ })
        .click();
      const authModal = guest.getByRole('dialog', {
        name: 'Diplomatic Credentials',
      });
      await expect(authModal).toContainText('claim Turkey');
      await recorder.recordStep(guest, '08_phone_guest_claim_signs_in');

      // 9. Back in the lobby, Bob's row offers Resume and marks Italy his.
      await bob.goto('/');
      await expect(seat(bob, open, 'ITALY')).toHaveAttribute(
        'data-seat',
        'mine',
        { timeout: 15000 },
      );
      await expect(
        row(bob, open).getByRole('button', { name: 'Join' }),
      ).toHaveCount(0);
      await scrollToTop(bob, 'browser-filters');
      await recorder.recordStep(bob, '09_desktop_resume_own_game');
      await row(bob, open)
        .getByRole('button', { name: /Resume/ })
        .click();
      await bob.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      recorder.finalize('PASSED');
    } catch (error) {
      const page = bob ?? guest;
      if (page) await recorder.recordStep(page, 'error_state').catch(() => {});
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
