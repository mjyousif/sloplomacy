// @scenario press
// @description Press (chat) between three seated players: public box, a private thread a third player never receives, one-way anonymous DMs in the Backchannel inbox, anonymous messages in a group thread and the public box, province links lighting the map, unread badges, the phone drawer, and a move suggestion written on the map, shown to its recipient and taken into their orders.
import { type Browser, expect, type Page, test } from '@playwright/test';
import {
  clickProvince,
  DEFAULT_E2E_API_URL,
  ScenarioRecorder,
} from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
  power: string;
}

const ALICE: Player = {
  id: 'local_press_alice',
  email: 'press.alice@example.com',
  name: 'Alice',
  power: 'FRANCE',
};
const BOB: Player = {
  id: 'local_press_bob',
  email: 'press.bob@example.com',
  name: 'Bob',
  power: 'GERMANY',
};
const CAROL: Player = {
  id: 'local_press_carol',
  email: 'press.carol@example.com',
  name: 'Carol',
  power: 'ENGLAND',
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
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** A match hosted by Alice (France), with Bob (Germany) and Carol (England) seated. */
async function createMatch(name: string): Promise<string> {
  const created = await api(ALICE, '/api/games', {
    name,
    creator_power: ALICE.power,
    user_id: ALICE.id,
    email: ALICE.email,
    display_name: ALICE.name,
  });
  for (const player of [BOB, CAROL]) {
    await api(player, `/api/games/${created.game_id}/join`, {
      power: player.power,
      user_id: player.id,
      email: player.email,
      display_name: player.name,
    });
  }
  return created.game_id;
}

/** Opens the match as a signed-in demo player, in a browser of their own. */
async function openAs(
  browser: Browser,
  player: Player,
  matchName: string,
  phone = false,
): Promise<Page> {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
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

const messages = (page: Page) => page.locator('[data-testid="press-message"]:visible');

async function send(page: Page, text: string) {
  await page.locator('[data-testid="press-input"]:visible').fill(text);
  await page.locator('[data-testid="press-send"]:visible').click();
}

test.describe('Scenario: Press between three players', () => {
  test('public box, private thread, anonymous press and province links', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('press');
    const matchName = `Press ${Date.now()}`;
    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName);
      const bob = await openAs(browser, BOB, matchName);
      recorder.attachListeners(alice);
      recorder.attachListeners(bob);

      // 1. The section sits under Diplomatic Standing, on the empty public box.
      const section = alice.locator('[data-testid="press-section"]');
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      await expect(alice.locator('[data-testid="press-destination"]')).toHaveText(
        'To everyone, in the public box.',
      );
      // Each other country's standings row has a letter button on its right. A seat nobody
      // holds cannot be written to, and the player's own row has none.
      await expect(alice.locator('[data-testid="press-recipient-GERMANY"]:visible')).toBeEnabled();
      await expect(alice.locator('[data-testid="press-recipient-ITALY"]:visible')).toBeDisabled();
      await expect(alice.locator('[data-testid="press-recipient-FRANCE"]')).toHaveCount(0);
      await recorder.recordStep(alice, 'empty_public_box_under_standings');

      // 2. Public press reaches the other players live, over the game socket.
      await send(alice, 'France proposes peace: nobody enters BUR this spring.');
      await expect(messages(alice)).toHaveCount(1);
      await bob.locator('[data-testid="press-section"]').scrollIntoViewIfNeeded();
      await expect(messages(bob)).toHaveCount(1);
      await expect(messages(bob).first()).toContainText('nobody enters BUR');
      await expect(messages(bob).first().locator('[data-testid="press-author"]')).toHaveText(
        'France',
      );
      await expect(
        messages(bob).first().locator('[data-testid="press-player-name"]'),
      ).toHaveText(`· ${ALICE.name}`);

      // 3. Bob lights France's letter button: a private thread. Alice gets an unread badge on
      // its chip and on Germany's letter button.
      const bobToFrance = bob.locator('[data-testid="press-recipient-FRANCE"]:visible');
      await bobToFrance.click();
      await expect(bobToFrance).toHaveAttribute('aria-pressed', 'true');
      await expect(bob.locator('[data-testid="press-destination"]')).toHaveText(
        'Private to France.',
      );
      await send(bob, 'Between us: I leave Burgundy alone if you support me into BEL.');
      await expect(messages(bob)).toHaveCount(1);
      const thread = alice.locator('[data-testid="press-channel-FRANCE+GERMANY"]');
      await expect(thread.locator('[data-testid="press-unread"]')).toHaveText('1');
      await expect(alice.locator('[data-testid="press-unread-total"]')).toHaveText('1');
      const aliceToGermany = alice.locator('[data-testid="press-recipient-GERMANY"]:visible');
      await expect(aliceToGermany.locator('[data-testid="press-pick-unread"]')).toHaveText('1');
      await recorder.recordStep(alice, 'private_thread_arrives_with_unread_badge');

      // Carol holds England: the server never sends her the thread.
      const carolFeed = await api(CAROL, `/api/press?game_id=${gameId}&power=ENGLAND`);
      expect(carolFeed.messages.map((m: { body: string }) => m.body)).toEqual([
        'France proposes peace: nobody enters BUR this spring.',
      ]);

      // 4. Opening the thread reads it, lights Germany's button, and its provinces light the map.
      await thread.click();
      await expect(alice.locator('[data-testid="press-unread-total"]')).toHaveCount(0);
      await expect(aliceToGermany).toHaveAttribute('aria-pressed', 'true');
      await expect(aliceToGermany.locator('[data-testid="press-pick-unread"]')).toHaveCount(0);
      const belgium = alice.locator(
        '[data-testid="press-province-link"][data-province="BEL"]',
      );
      await belgium.hover();
      await recorder.recordStep(alice, 'thread_open_belgium_highlighted_on_map');
      await belgium.click();

      // 5. Anonymous press. In the one-to-one thread with France, the mask sends a one-way
      // message to France's Backchannel inbox without revealing Germany.
      const bobMask = bob.locator('[data-testid="press-anonymous"]:visible');
      await expect(bobMask).toBeEnabled();
      await bobMask.click();
      await expect(bobMask).toHaveAttribute('aria-pressed', 'true');
      await expect(bob.locator('[data-testid="press-destination"]')).toHaveText(
        'Unsigned, to France (one-way backchannel).',
      );
      await send(bob, 'Watch the North Sea.');
      await recorder.recordStep(bob, 'backchannel_sent_one_way');

      const backchannel = alice.locator('[data-testid="press-channel-backchannel"]');
      await expect(backchannel.locator('[data-testid="press-unread"]')).toHaveText('1');
      await backchannel.click();
      await expect(alice.locator('[data-testid="press-channel-caption"]')).toHaveText(
        'Anonymous backchannel',
      );
      await expect(messages(alice)).toHaveCount(1);
      await expect(messages(alice).first().locator('[data-testid="press-author"]')).toHaveText(
        'Anonymous',
      );
      await expect(alice.locator('[data-testid="press-input"]:visible')).toBeDisabled();
      await expect(alice.locator('[data-testid="press-send"]:visible')).toBeDisabled();
      await recorder.recordStep(alice, 'backchannel_received_in_inbox');

      // With England lit too it is the three-power thread, and the message is posted there.
      const bobToEngland = bob.locator('[data-testid="press-recipient-ENGLAND"]:visible');
      await bobToEngland.click();
      await expect(bobMask).toHaveAttribute('aria-pressed', 'true');
      await expect(bob.locator('[data-testid="press-destination"]')).toHaveText(
        'Unsigned, to the thread with France, England.',
      );
      await send(bob, 'England means to take the Channel.');
      const group = alice.locator('[data-testid="press-channel-FRANCE+ENGLAND+GERMANY"]');
      await expect(group.locator('[data-testid="press-unread"]')).toHaveText('1');
      await group.click();
      await expect(messages(alice)).toHaveCount(1);
      await expect(messages(alice).first().locator('[data-testid="press-author"]')).toHaveText(
        'Anonymous',
      );
      await expect(alice.locator('[data-testid="press-channel-notes"]')).toHaveCount(0);
      await recorder.recordStep(alice, 'anonymous_in_group_thread_author_hidden');
      await recorder.recordStep(bob, 'sender_sees_own_anonymous_message_in_thread');
      // Carol is in the thread too. She is told the whole thread, never who wrote it.
      const carolGroup = (
        await api(CAROL, `/api/press?game_id=${gameId}&power=ENGLAND`)
      ).messages.find((m: { body: string }) => m.body.startsWith('England means'));
      expect(carolGroup.sender).toBeNull();
      expect(carolGroup.recipients).toEqual(['ENGLAND', 'FRANCE', 'GERMANY']);

      // 6. With nobody lit the mask stays on and posts to the public box. With the sidebar
      // folded, Alice's rail Press button carries the unread count.
      await alice.locator('[data-testid="press-channel-public"]').click();
      await alice.locator('[data-testid="tools-sidebar-collapse-btn"]').click();
      await bobToFrance.click();
      await bobToEngland.click();
      await expect(bobToFrance).toHaveAttribute('aria-pressed', 'false');
      await expect(bobMask).toHaveAttribute('aria-pressed', 'true');
      await expect(bob.locator('[data-testid="press-destination"]')).toHaveText(
        'To everyone, unsigned.',
      );
      await send(bob, 'Someone here will betray France.');
      const railButton = alice.locator('[data-testid="tools-rail-press-btn"]');
      await expect(railButton.locator('[data-testid="press-unread-badge"]')).toHaveText('1');
      await recorder.recordStep(alice, 'collapsed_rail_unread_badge');
      await recorder.recordStep(bob, 'anonymous_public_post');
      const carolPublic = (
        await api(CAROL, `/api/press?game_id=${gameId}&power=ENGLAND`)
      ).messages.find((m: { body: string }) => m.body.startsWith('Someone here'));
      expect(carolPublic.sender).toBeNull();

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });

  test('move suggestion: written on the map, shown and taken by its recipient', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('press_suggestion');
    const matchName = `Press plan ${Date.now()}`;
    const unit = (page: Page, id: string) =>
      page.locator(`[data-testid="unit-token"][data-unit-id="${id}"]`);
    const arrow = (page: Page, unitId: string, target: string) =>
      page.locator(
        `[data-testid="order-arrow"][data-order-unit="${unitId}"][data-order-target="${target}"]`,
      );
    const ordersOf = async (player: Player, gameId: string) =>
      (await api(player, `/api/game?game_id=${gameId}&power=${player.power}`))
        .state.orders;
    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName);
      const bob = await openAs(browser, BOB, matchName);
      recorder.attachListeners(alice);
      recorder.attachListeners(bob);

      // 1. The lamp button is offered in public press and private threads, and hidden in
      // anonymous group threads.
      await alice
        .locator('[data-testid="press-section"]')
        .scrollIntoViewIfNeeded();
      await expect(alice.locator('[data-testid="press-suggest"]:visible')).toHaveCount(
        1,
      );
      await alice
        .locator('[data-testid="press-recipient-GERMANY"]:visible')
        .click();
      await alice
        .locator('[data-testid="press-recipient-ENGLAND"]:visible')
        .click();
      await alice.locator('[data-testid="press-anonymous"]:visible').click();
      await expect(alice.locator('[data-testid="press-suggest"]')).toHaveCount(
        0,
      );
      await alice.locator('[data-testid="press-anonymous"]:visible').click();
      await alice
        .locator('[data-testid="press-recipient-ENGLAND"]:visible')
        .click();
      const lamp = alice.locator('[data-testid="press-suggest"]:visible');
      await lamp.click();
      await expect(lamp).toHaveAttribute('aria-pressed', 'true');
      const alicePill = alice.locator('[data-testid="suggestion-pill"]');
      await expect(alicePill).toHaveAttribute('data-mode', 'draft');
      await expect(
        alice.locator('[data-testid="history-lock-bar"]'),
      ).toBeVisible();
      await recorder.recordStep(alice, 'suggest_mode_started_empty');

      // 2. Alice orders a German unit and one of her own on the map. England is not in the
      // thread, so its units cannot be picked up.
      await unit(alice, 'GER_A_MUN').click();
      await clickProvince(alice, 'BUR');
      await expect(arrow(alice, 'GER_A_MUN', 'BUR')).toBeVisible();
      await unit(alice, 'FRA_A_PAR').click();
      await clickProvince(alice, 'PIC');
      await expect(arrow(alice, 'FRA_A_PAR', 'PIC')).toBeVisible();
      await unit(alice, 'ENG_F_LON').click();
      await expect(
        alice.locator('[data-testid="unit-floating-menu"]'),
      ).toHaveCount(0);
      const draft = alice.locator('[data-testid="press-suggestion-draft"]');
      await expect(
        draft.locator('[data-testid="suggested-order"]'),
      ).toHaveCount(2);
      await recorder.recordStep(alice, 'joint_plan_drawn_on_map_and_listed');

      // Nothing has reached the server: Alice's real orders are as they were.
      expect((await ordersOf(ALICE, gameId)).FRA_A_PAR.order_type).toBe('HOLD');

      // 3. Sending it ends suggest mode, and her own board shows no such order.
      await send(alice, 'Take Burgundy. I go north.');
      await expect(alicePill).toHaveCount(0);
      await expect(arrow(alice, 'FRA_A_PAR', 'PIC')).toHaveCount(0);
      const sent = messages(alice)
        .last()
        .locator('[data-testid="press-suggestion"]');
      await expect(sent.locator('[data-testid="suggested-order"]')).toHaveCount(
        2,
      );
      await expect(sent.locator('[data-testid="suggestion-use"]')).toHaveCount(
        0,
      );
      await recorder.recordStep(alice, 'suggestion_sent_in_thread');
      expect((await ordersOf(ALICE, gameId)).FRA_A_PAR.order_type).toBe('HOLD');

      // Carol (England) is served no part of it.
      const carolFeed = await api(
        CAROL,
        `/api/press?game_id=${gameId}&power=ENGLAND`,
      );
      expect(carolFeed.messages).toEqual([]);

      // 4. Bob opens the thread and shows the plan on the map: both halves, read-only.
      await bob
        .locator('[data-testid="press-section"]')
        .scrollIntoViewIfNeeded();
      await bob.locator('[data-testid="press-channel-FRANCE+GERMANY"]').click();
      const card = messages(bob)
        .last()
        .locator('[data-testid="press-suggestion"]');
      await expect(
        card.locator('[data-testid="suggested-orders-GERMANY"]'),
      ).toContainText('A MUN');
      await card.locator('[data-testid="suggestion-show"]').click();
      const bobPill = bob.locator('[data-testid="suggestion-pill"]');
      await expect(bobPill).toHaveAttribute('data-mode', 'view');
      await expect(arrow(bob, 'GER_A_MUN', 'BUR')).toBeVisible();
      await expect(arrow(bob, 'FRA_A_PAR', 'PIC')).toBeVisible();
      await unit(bob, 'GER_A_MUN').click({ force: true });
      await expect(
        bob.locator('[data-testid="unit-floating-menu"]'),
      ).toHaveCount(0);
      await recorder.recordStep(bob, 'recipient_views_suggestion_on_map');
      expect((await ordersOf(BOB, gameId)).GER_A_MUN.order_type).toBe('HOLD');

      // 5. Bob takes it: his own unit gets the order, France's half stays a claim.
      await bobPill.locator('[data-testid="suggestion-take"]').click();
      await expect(bobPill).toHaveCount(0);
      await expect(arrow(bob, 'GER_A_MUN', 'BUR')).toBeVisible();
      await expect(arrow(bob, 'FRA_A_PAR', 'PIC')).toHaveCount(0);
      await recorder.recordStep(bob, 'recipient_took_the_orders');
      expect((await ordersOf(BOB, gameId)).GER_A_MUN.target).toBe('BUR');
      expect((await ordersOf(ALICE, gameId)).FRA_A_PAR.order_type).toBe('HOLD');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });

  test('phone: unread badge on Press button, full-width Press sheet and inline recipients', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('press_phone');
    const matchName = `Press phone ${Date.now()}`;
    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName, true);
      recorder.attachListeners(alice);
      await expect(alice.locator('[data-layout]')).toHaveAttribute('data-layout', 'compact');

      // A message arrives while the sheet is closed: the Press button in the peek shows it.
      await api(BOB, `/api/press?game_id=${gameId}`, {
        power: 'GERMANY',
        recipients: [],
        anonymous: false,
        body: 'Germany proposes peace in the west. Hands off Burgundy.',
      });
      const pressBtn = alice.locator('[data-testid="mobile-press-toggle"]');
      await expect(pressBtn.locator('[data-testid="press-unread-badge"]')).toHaveText('1');
      await expect(alice.locator('[data-testid="compact-tools-toggle"] [data-testid="press-unread-badge"]')).toHaveCount(0);
      await recorder.recordStep(alice, 'phone_unread_badge_on_press_button');

      // Opening Press opens a full-width sheet with inline recipients; reading clears the badge.
      await pressBtn.tap();
      const pressSheet = alice.locator('[data-testid="mobile-press-sheet"]');
      await expect(pressSheet).toHaveAttribute('data-open', 'true');
      await expect(messages(alice)).toHaveCount(1);
      await expect(pressBtn.locator('[data-testid="press-unread-badge"]')).toHaveCount(0);
      const sheetBox = await pressSheet.boundingBox();
      const inputBox = await alice.locator('[data-testid="press-input"]:visible').boundingBox();
      expect(sheetBox?.width).toBeGreaterThanOrEqual(380);
      expect(inputBox?.width).toBeGreaterThanOrEqual(220);
      await recorder.recordStep(alice, 'phone_press_full_width_sheet');

      // Germany's inline recipient chip is finger-sized and opens Private to Germany directly.
      const toGermany = alice.locator('[data-testid="press-recipient-bar"] [data-testid="press-recipient-GERMANY"]');
      const chipBox = await toGermany.boundingBox();
      expect(chipBox?.height).toBeGreaterThanOrEqual(32);
      await toGermany.tap();
      await expect(toGermany).toHaveAttribute('aria-pressed', 'true');
      await expect(alice.locator('[data-testid="press-destination"]:visible')).toHaveText(
        'Private to Germany.',
      );
      await recorder.recordStep(alice, 'phone_inline_recipient_lit');

      await alice.locator('[data-testid="press-recipient-public"]').tap();
      await expect(alice.locator('[data-testid="press-recipient-public"]')).toHaveAttribute('aria-pressed', 'true');

      // The page never scrolls sideways.
      const widths = await alice.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(widths.scroll).toBe(widths.inner);

      // Tapping a province closes the Press sheet and lights the province on the map.
      await alice
        .locator('[data-testid="press-province-link"][data-province="BUR"]')
        .tap();
      await expect(pressSheet).not.toHaveAttribute('data-open', 'true');
      await recorder.recordStep(alice, 'phone_province_tap_shows_map');

      // Opening the Tools drawer shows the drawer Press launcher, and Standings envelopes launch Press.
      await alice.locator('[data-testid="compact-tools-toggle"]').tap();
      await expect(alice.locator('[data-testid="tools-drawer"] [data-testid="drawer-open-press-btn"]')).toBeVisible();
      await expect(alice.locator('[data-testid="tools-drawer"] [data-testid="press-section"]')).toHaveCount(0);
      const drawerGermany = alice.locator('[data-testid="tools-drawer"] [data-testid="press-recipient-GERMANY"]');
      await drawerGermany.scrollIntoViewIfNeeded();
      await drawerGermany.tap();
      await expect(alice.locator('[data-testid="tools-drawer-layer"]')).not.toHaveAttribute('data-open', 'true');
      await expect(pressSheet).toHaveAttribute('data-open', 'true');
      await expect(alice.locator('[data-testid="press-destination"]:visible')).toHaveText('Private to Germany.');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
