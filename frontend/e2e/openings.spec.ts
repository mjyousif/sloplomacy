// @scenario openings
// @description Spring 1901 book openings in the order panel: the Openings button beside Clear All, the list in place of the unit cards with strengths, weaknesses and sources, a preview on the map, "Use these orders" filling in the player's own orders in a match and in Hypothetical Mode, the button gone after the first turn, and the phone sheet.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
  power: string;
}

// Each run has its own players, so the lobby shows this run's match first.
const RUN = Date.now();
const ALICE: Player = {
  id: `local_openings_alice_${RUN}`,
  email: `openings.alice.${RUN}@example.com`,
  name: 'Alice',
  power: 'FRANCE',
};
const BOB: Player = {
  id: `local_openings_bob_${RUN}`,
  email: `openings.bob.${RUN}@example.com`,
  name: 'Bob',
  power: 'GERMANY',
};

/** The unsigned token the app sends for a local demo sign-in (see lib/supabase.ts). */
function demoHeaders(player: Player): Record<string, string> {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: player.id, email: player.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function api(player: Player, path: string, body?: object) {
  const res = await fetch(`${DEFAULT_E2E_API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: demoHeaders(player),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** A match hosted by Alice (France) with Bob (Germany) seated. */
async function createMatch(
  name: string,
  host: Player = ALICE,
  guest: Player = BOB,
): Promise<string> {
  const created = await api(host, '/api/games', {
    name,
    creator_power: host.power,
    user_id: host.id,
    email: host.email,
    display_name: host.name,
  });
  await api(guest, `/api/games/${created.game_id}/join`, {
    power: guest.power,
    user_id: guest.id,
    email: guest.email,
    display_name: guest.name,
  });
  return created.game_id;
}

/** Two more players for the phone test, with no other games either. */
function freshPlayers(): [Player, Player] {
  const run = RUN + 1;
  return [
    { ...ALICE, id: `${ALICE.id}_${run}`, email: `alice.${run}@example.com` },
    { ...BOB, id: `${BOB.id}_${run}`, email: `bob.${run}@example.com` },
  ];
}

async function openAs(
  browser: Browser,
  player: Player,
  matchName: string,
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
  const page = await context.newPage();
  await page.goto('/');
  const row = page
    .locator('[data-testid="featured-game-hero"], [data-testid="my-game-row"]')
    .filter({ hasText: matchName });
  await row.getByRole('button', { name: /^Resume as/ }).click();
  await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
  return page;
}

/** The header button of an opening's row, picked by its id so similar names never clash. */
const openingRow = (list: ReturnType<Page['getByTestId']>, id: string) =>
  list.locator(`[data-opening="${id}"]`).getByRole('button').first();

const arrow = (page: Page, unit: string, target: string) =>
  page.locator(
    `[data-testid="order-arrow"][data-order-unit="${unit}"][data-order-target="${target}"]`,
  );

test.describe('Scenario: Spring 1901 openings', () => {
  test('preview and use an opening in a match, then in Hypothetical Mode', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('openings');
    const matchName = `Openings ${Date.now()}`;
    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName);
      const bob = await openAs(browser, BOB, matchName);
      recorder.attachListeners(alice);
      recorder.attachListeners(bob);

      // 1. The button sits beside Clear All; the list replaces the unit cards.
      const button = alice.getByTestId('btn-openings');
      await expect(button).toBeVisible();
      await expect(alice.getByTestId('btn-clear-all')).toBeVisible();
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const list = alice.getByTestId('openings-list');
      await expect(list).toBeVisible();
      await expect(list).toContainText('France openings');
      const rows = list.getByTestId('opening-row');
      await expect(rows.first()).toHaveAttribute('data-opening', 'fra-maginot');
      await expect(rows.first().getByTestId('opening-approach')).toHaveText(
        'Defensive',
      );
      await expect(
        rows.first().getByRole('img', { name: 'Against Germany' }),
      ).toBeVisible();
      await recorder.recordStep(alice, 'openings_list_open');

      // 2. Picking one shows it on the map, read-only, with its strengths and weaknesses.
      await openingRow(list, 'fra-maginot').click();
      const pill = alice.getByTestId('suggestion-pill');
      await expect(pill).toContainText('Maginot Opening');
      await expect(pill.getByTestId('suggestion-take')).toHaveCount(0);
      await expect(arrow(alice, 'FRA_F_BRE', 'MAO')).toBeVisible();
      await expect(arrow(alice, 'FRA_A_PAR', 'BUR')).toBeVisible();
      await expect(list.getByRole('list', { name: 'Strengths' })).toBeVisible();
      await expect(
        list.getByRole('link', { name: /Naming the Openings/ }),
      ).toHaveAttribute('href', 'https://diplomacyzines.co.uk/?page_id=2205');
      await recorder.recordStep(alice, 'maginot_previewed_on_map');

      // Another pick replaces it.
      await openingRow(list, 'fra-picardy').click();
      await expect(pill).toContainText('Picardy Opening');
      await expect(arrow(alice, 'FRA_A_PAR', 'PIC')).toBeVisible();
      await expect(arrow(alice, 'FRA_A_PAR', 'BUR')).toHaveCount(0);

      // 3. Using it fills in Alice's orders, closes the list and leaves them unfinalized.
      await list.getByTestId('opening-use').click();
      await expect(list).toHaveCount(0);
      await expect(pill).toHaveCount(0);
      await expect(arrow(alice, 'FRA_A_PAR', 'PIC')).toBeVisible();
      await expect(arrow(alice, 'FRA_A_MAR', 'SPA')).toBeVisible();
      await expect(alice.getByTestId('btn-finalize-orders')).toBeVisible();
      await recorder.recordStep(alice, 'picardy_used_as_orders');

      // The server holds them as Alice's; Bob is not shown them.
      const aliceView = (await api(ALICE, `/api/game?game_id=${gameId}`)).state;
      expect(aliceView.orders.FRA_A_PAR).toMatchObject({
        order_type: 'MOVE',
        target: 'PIC',
      });
      expect(aliceView.finalized_powers).not.toContain('FRANCE');
      const bobView = (await api(BOB, `/api/game?game_id=${gameId}`)).state;
      expect(bobView.orders.FRA_A_PAR?.target ?? null).not.toBe('PIC');

      // 4. Bob is offered Germany's openings, not France's.
      await bob.getByTestId('btn-openings').click();
      await expect(bob.getByTestId('openings-list')).toContainText(
        'Germany openings',
      );
      await expect(bob.getByTestId('opening-row').first()).toHaveAttribute(
        'data-opening',
        'ger-blitz-danish',
      );

      // 5. In Hypothetical Mode an opening goes to the private copy, never the real orders.
      await alice.getByTestId('btn-toggle-sandbox').click();
      await expect(alice.getByTestId('btn-toggle-sandbox')).toContainText(
        /Exit Mode/i,
      );
      await alice.getByTestId('btn-openings').click();
      const hypoList = alice.getByTestId('openings-list');
      await openingRow(hypoList, 'fra-burgundy').click();
      await hypoList.getByTestId('opening-use').click();
      await expect(arrow(alice, 'FRA_A_PAR', 'BUR')).toBeVisible();
      await recorder.recordStep(alice, 'hypothetical_burgundy_used');
      const realDuring = (await api(ALICE, `/api/game?game_id=${gameId}`))
        .state;
      expect(realDuring.orders.FRA_A_PAR.target).toBe('PIC');
      await alice.getByTestId('btn-toggle-sandbox').click();
      await expect(arrow(alice, 'FRA_A_PAR', 'PIC')).toBeVisible();

      // 6. Once the first turn resolves, there are no openings.
      for (const [player, power] of [
        [ALICE, 'FRANCE'],
        [BOB, 'GERMANY'],
      ] as const) {
        await api(player, `/api/finalize?game_id=${gameId}`, {
          power,
          force: true,
          turn: 'Spring 1901 Movement',
        });
      }
      await expect(alice.getByText('Fall 1901').first()).toBeVisible({
        timeout: 15000,
      });
      await expect(alice.getByTestId('btn-openings')).toHaveCount(0);
      await expect(alice.getByTestId('btn-clear-all')).toBeVisible();
      await recorder.recordStep(alice, 'fall_1901_no_openings');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });

  test('phone: openings in the order sheet', async ({ browser }) => {
    const recorder = new ScenarioRecorder('openings_phone');
    const matchName = `Openings phone ${Date.now()}`;
    try {
      const [host, player] = freshPlayers();
      await createMatch(matchName, host, player);
      const bob = await openAs(browser, player, matchName, true);
      recorder.attachListeners(bob);

      await bob.getByTestId('bottom-sheet-handle').tap();
      const button = bob.getByTestId('btn-openings');
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
      await button.tap();
      const list = bob.getByTestId('openings-list');
      await expect(list).toBeVisible();
      await recorder.recordStep(bob, 'phone_openings_list');

      await openingRow(list, 'ger-jutland').tap();
      await expect(list.getByTestId('opening-detail')).toContainText(
        'F DEN - SKA',
      );
      await expect(bob.getByTestId('suggestion-pill')).toContainText(
        'Jutland Gambit',
      );
      await recorder.recordStep(bob, 'phone_jutland_detail');

      await list.getByTestId('opening-use').tap();
      await expect(list).toHaveCount(0);
      await expect(arrow(bob, 'GER_F_KIE', 'DEN')).toHaveCount(1);
      await recorder.recordStep(bob, 'phone_jutland_used');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
