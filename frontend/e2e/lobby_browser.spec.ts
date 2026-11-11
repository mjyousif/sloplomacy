// @scenario lobby_browser
// @order 9
// @description Lobby game browser: paged public games with open-seat, country, turn and full filters, a guest's claim asking to sign in, and a private campaign shown only in its member's My Games.
import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

const HOST_EMAIL = 'browserhost@slop.eu';
// The local demo sign-in names a user after their email.
const HOST_ID = `local_${HOST_EMAIL.replace(/[^a-z0-9]/g, '_')}`;

/** An unsigned token, which the development backend accepts like the local demo sign-in. */
function devToken(sub: string, email: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, email })}.`;
}

async function api(path: string, sub: string, body?: object) {
  const res = await fetch(`${DEFAULT_E2E_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken(sub, `${sub}@e2e.test`)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function createGame(
  sub: string,
  name: string,
  power: string,
  extra: object = {},
) {
  const game = await api('/api/games', sub, {
    name,
    creator_power: power,
    display_name: sub,
    ...extra,
  });
  return game.game_id as string;
}

const row = (page: Page, gameId: string) =>
  page.getByTestId(`browser-row-${gameId}`);

test.describe('Scenario 09: Lobby game browser', () => {
  test('filters public games, hides private ones, and asks a guest to sign in', async ({
    page,
  }) => {
    const recorder = new ScenarioRecorder('lobby_browser');
    recorder.attachListeners(page);

    try {
      const tag = Date.now().toString(36).slice(-4);
      const open = await createGame('e2e_alice', `Open Table ${tag}`, 'FRANCE');
      const italian = await createGame(
        'e2e_alice',
        `Italian Front ${tag}`,
        'ITALY',
      );
      const moved = await createGame(
        'e2e_alice',
        `Fall Campaign ${tag}`,
        'GERMANY',
      );
      await api(`/api/adjudicate?game_id=${moved}`, 'e2e_alice');
      const full = await createGame(
        'e2e_alice',
        `Packed House ${tag}`,
        'AUSTRIA',
      );
      const others = [
        'ENGLAND',
        'FRANCE',
        'GERMANY',
        'ITALY',
        'RUSSIA',
        'TURKEY',
      ];
      for (const [i, power] of others.entries()) {
        await api(`/api/games/${full}/join`, `e2e_p${i}`, {
          power,
          display_name: `p${i}`,
        });
      }
      const secret = await createGame(
        HOST_ID,
        `Hidden Cabal ${tag}`,
        'RUSSIA',
        {
          is_private: true,
          passcode: 'e2e-secret',
        },
      );

      // 1. A guest sees the open public games, the most recently played first. The full and
      //    the private game are not listed.
      await page.goto('/');
      await expect(row(page, open)).toBeVisible({ timeout: 15000 });
      await expect(row(page, italian)).toBeVisible();
      await expect(row(page, moved)).toContainText('F1901 Moves');
      await expect(row(page, full)).toHaveCount(0);
      await expect(row(page, secret)).toHaveCount(0);
      const firstRow = page.locator('.browser-row').first();
      await expect(firstRow).toHaveAttribute(
        'data-testid',
        `browser-row-${moved}`,
      );
      await page.getByTestId('game-browser').scrollIntoViewIfNeeded();
      await recorder.recordStep(page, '01_browser_open_games');

      // 2. Only games where Italy is still free.
      await page.getByTitle('Italy must be unclaimed').click();
      await expect(row(page, italian)).toHaveCount(0);
      await expect(row(page, open)).toBeVisible();
      await recorder.recordStep(page, '02_filter_italy_open');

      // 3. Only games after Spring 1901.
      await page.getByRole('button', { name: /Clear filters/ }).click();
      await page.getByLabel('Turn comparison').selectOption('after');
      await page.getByLabel('Turn season').selectOption('Spring');
      await page.getByLabel('Turn year').fill('1901');
      await expect(row(page, open)).toHaveCount(0);
      await expect(row(page, moved)).toBeVisible();
      await recorder.recordStep(page, '03_filter_after_spring_1901');

      // 4. Full games.
      await page.getByRole('button', { name: /Clear filters/ }).click();
      await page
        .getByRole('button', { name: 'Full', exact: true })
        .first()
        .click();
      await expect(row(page, full)).toBeVisible();
      await expect(row(page, full)).toContainText('Full');
      await expect(row(page, open)).toHaveCount(0);
      await recorder.recordStep(page, '04_full_games');

      // 5. A guest opens a game's seats; claiming one asks them to sign in.
      await page.getByRole('button', { name: /Clear filters/ }).click();
      await row(page, open).getByRole('button', { name: 'Join' }).click();
      await expect(
        row(page, open).getByRole('button', { name: /Claim Italy/ }),
      ).toBeVisible();
      await expect(
        row(page, open).getByRole('button', { name: /France/ }),
      ).toBeDisabled();
      await recorder.recordStep(page, '05_row_open_with_seats');
      await row(page, open)
        .getByRole('button', { name: /Claim Italy/ })
        .click();
      const authModal = page.getByRole('dialog', {
        name: 'Diplomatic Credentials',
      });
      await expect(authModal).toContainText('claim Italy');
      await recorder.recordStep(page, '06_guest_claim_prompts_sign_in');

      // 6. Signed in, the private campaign's member finds it in My Games, still not in the browser.
      await page.fill('#auth-email', HOST_EMAIL);
      await page.fill('#auth-password', 'password123');
      await page
        .getByRole('button', { name: 'Sign In to Chancellery' })
        .click();
      await expect(authModal).toHaveCount(0);
      const myGames = page.locator('.my-games-list');
      await expect(myGames).toContainText(`Hidden Cabal ${tag}`);
      await expect(myGames).toContainText('Private');
      await expect(row(page, secret)).toHaveCount(0);
      await page.locator('.my-games-list').scrollIntoViewIfNeeded();
      await recorder.recordStep(page, '07_private_game_only_in_my_games');

      // 7. On a phone each row stacks into lines, with the dates labelled.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('[data-layout="compact"]')).toHaveCount(1);
      await row(page, moved).scrollIntoViewIfNeeded();
      await expect(page.locator('.browser-head')).toBeHidden();
      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(width.scroll).toBeLessThanOrEqual(width.inner);
      await recorder.recordStep(page, '08_phone_browser_rows');

      recorder.finalize('PASSED');
    } catch (error) {
      await recorder.recordStep(page, 'error_state').catch(() => {});
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
