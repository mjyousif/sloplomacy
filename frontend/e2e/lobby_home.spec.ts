// @scenario lobby_home
// @description Homepage for a player with games: the map hero of the game that needs them, the other-games strip, the ⋯ leave menu, and a second player who gets no board and no private game.
import { type BrowserContext, expect, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface DemoUser {
  id: string;
  email: string;
  displayName: string;
}

const stamp = Date.now().toString(36);
const HOST: DemoUser = {
  id: `local_hero_host_${stamp}`,
  email: `hero.host.${stamp}@e2e.test`,
  displayName: 'Metternich',
};
const RIVAL: DemoUser = {
  id: `local_hero_rival_${stamp}`,
  email: `hero.rival.${stamp}@e2e.test`,
  displayName: 'Castlereagh',
};

/** The unsigned token the local demo sign-in sends; the dev backend accepts it. */
function authHeaders(user: DemoUser): Record<string, string> {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  const token = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: user.id, email: user.email })}.`;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api<T>(user: DemoUser, path: string, body?: object): Promise<T> {
  const res = await fetch(`${DEFAULT_E2E_API_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(user),
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(res.ok, `${path} -> ${res.status}`).toBe(true);
  return res.json() as Promise<T>;
}

/** Signs a browser context in as a local demo account before any page script runs. */
async function signIn(context: BrowserContext, user: DemoUser) {
  await context.addInitScript((stored) => {
    localStorage.setItem('diplomacy_1901_local_auth_user', JSON.stringify(stored));
  }, { ...user, isLocalDemo: true, needsUsernameSetup: false });
}

test.describe('Scenario: Homepage map hero', () => {
  test('features the game that needs the player, and shows a rival no board', async ({ browser }) => {
    const recorder = new ScenarioRecorder('lobby_home');

    // The host has a public match already played a turn, and a private campaign.
    const played = await api<{ game_id: string }>(HOST, '/api/games', {
      name: `Hero Table ${stamp}`,
      creator_power: 'FRANCE',
      display_name: HOST.displayName,
    });
    await api(RIVAL, `/api/games/${played.game_id}/join`, {
      power: 'GERMANY',
      display_name: RIVAL.displayName,
    });
    await api(HOST, `/api/adjudicate?game_id=${played.game_id}`);
    const secret = await api<{ game_id: string }>(HOST, '/api/games', {
      name: `Hero Cabal ${stamp}`,
      creator_power: 'ITALY',
      display_name: HOST.displayName,
      is_private: true,
      passcode: 'e2e-passcode',
    });

    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const rivalContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      // 1. The host's homepage opens on the map hero, not the banner.
      await signIn(hostContext, HOST);
      const page = await hostContext.newPage();
      recorder.attachListeners(page);
      await page.goto('/');
      const hero = page.getByTestId('featured-game-hero');
      await expect(hero).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('lobby-hero')).toHaveCount(0);
      await expect(hero).toHaveAttribute('data-urgency', 'your-move');
      await expect(hero.getByTestId('hero-status')).toHaveText('Your move');

      // The hero draws the board: owned provinces are coloured and the host's units are ringed.
      const heroMap = hero.getByTestId('mini-map');
      await expect(heroMap).toHaveAttribute('data-has-board', 'true');
      expect(await heroMap.locator('[data-owner]').count()).toBeGreaterThan(20);
      // Land that is not a supply center shows who controls it: Burgundy is still French home
      // land, and Spain belongs to nobody.
      await expect(heroMap.locator('[data-province-id="BUR"]')).toHaveAttribute('data-owner', 'FRANCE');
      await expect(heroMap.locator('[data-province-id="UKR"]')).toHaveAttribute('data-owner', 'RUSSIA');
      expect(await heroMap.locator('[data-province-id="SPA"]').getAttribute('data-owner')).toBeNull();
      expect(await heroMap.locator('[data-testid="mini-map-unit"]').count()).toBe(22);
      expect(await heroMap.locator('[data-mine="true"]').count()).toBe(3);

      // Both games wait on the host. The one that has resolved a turn takes the hero, and the
      // private campaign nobody has joined yet sits in the strip.
      await expect(hero.getByTestId('hero-game-name')).toHaveText(`Hero Table ${stamp}`);
      await expect(hero.getByTestId('hero-seat')).toContainText('You are France · 3 centers');
      const strip = page.getByTestId('other-games-strip');
      await expect(strip.getByTestId('my-game-card')).toHaveCount(1);
      await expect(strip.getByTestId('my-game-name')).toHaveText(`Hero Cabal ${stamp}`);
      await expect(strip.getByTestId('mini-map')).toHaveAttribute('data-has-board', 'true');
      await recorder.recordStep(page, '01_host_map_hero');

      // 2. Leaving sits behind the ⋯ menu and only opens the surrender dialog.
      await hero.getByTestId('game-actions-btn').click();
      await expect(hero.getByRole('menu')).toBeVisible();
      await recorder.recordStep(page, '02_leave_behind_menu');
      await page.keyboard.press('Escape');
      await expect(hero.getByRole('menu')).toHaveCount(0);

      // 3. The hero's button enters the game.
      await hero.getByTestId('hero-enter-btn').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '03_entered_from_hero');

      // 4. The rival sees the public match they are in, never the private one, and the public
      //    lobby list they are sent carries no board.
      await signIn(rivalContext, RIVAL);
      const rivalPage = await rivalContext.newPage();
      const lobbyList = rivalPage.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/games' && res.request().method() === 'GET',
      );
      await rivalPage.goto('/');
      const listed = (await (await lobbyList).json()) as Array<{
        game_id: string;
        board: unknown;
      }>;
      expect(listed.some((g) => g.game_id === played.game_id)).toBe(true);
      expect(listed.some((g) => g.game_id === secret.game_id)).toBe(false);
      expect(listed.every((g) => g.board === null || g.board === undefined)).toBe(true);

      const rivalHero = rivalPage.getByTestId('featured-game-hero');
      await expect(rivalHero).toBeVisible({ timeout: 15000 });
      await expect(rivalHero.getByTestId('hero-game-name')).toHaveText(`Hero Table ${stamp}`);
      await expect(rivalHero.getByTestId('hero-seat')).toContainText('You are Germany');
      await expect(rivalPage.getByText(`Hero Cabal ${stamp}`)).toHaveCount(0);
      await recorder.recordStep(rivalPage, '04_rival_sees_only_their_game');

      // 5. On a phone the hero stacks the map over the panel and never scrolls sideways.
      await page.goto('/');
      await page.setViewportSize({ width: 390, height: 844 });
      const phoneHero = page.getByTestId('featured-game-hero');
      await expect(phoneHero).toBeVisible({ timeout: 15000 });
      const phoneMap = await phoneHero.getByTestId('mini-map').boundingBox();
      expect(phoneMap && phoneMap.width > 300 && phoneMap.height > 250).toBe(true);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(widths.scroll).toBe(widths.inner);
      await recorder.recordStep(page, '05_phone_map_hero');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    } finally {
      await hostContext.close();
      await rivalContext.close();
    }
  });
});
