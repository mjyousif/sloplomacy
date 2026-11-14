// @scenario press
// @description Press (chat) between three seated players: public box, a private thread a third player never receives, an anonymous note, province links lighting the map, unread badges, and the phone drawer.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

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
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: player.id, email: player.email })}.`;
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
    .locator('[data-testid="my-game-row"]')
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
  test('public box, private thread, anonymous note and province links', async ({
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

      // 5. An anonymous note: France is still lit for Bob, who lights the mask beside Send. Alice cannot see who sent it.
      const bobMask = bob.locator('[data-testid="press-anonymous"]:visible');
      await bobMask.click();
      await expect(bobMask).toHaveAttribute('aria-pressed', 'true');
      await expect(bob.locator('[data-testid="press-destination"]')).toHaveText(
        'Anonymous note to France. They cannot reply.',
      );
      await send(bob, 'England means to take the Channel.');
      const notes = alice.locator('[data-testid="press-channel-notes"]');
      await expect(notes.locator('[data-testid="press-unread"]')).toHaveText('1');
      await notes.click();
      await expect(messages(alice)).toHaveCount(1);
      await expect(messages(alice).first().locator('[data-testid="press-author"]')).toHaveText(
        'Anonymous',
      );
      await expect(alice.locator('[data-testid="press-destination"]')).toHaveText(
        'Pick who receives the anonymous note on the standings above.',
      );
      await recorder.recordStep(alice, 'anonymous_note_author_hidden');
      await recorder.recordStep(bob, 'sender_sees_own_note_in_notes');

      // 6. With the sidebar folded, the rail's Press button carries the unread count.
      await alice.locator('[data-testid="press-channel-public"]').click();
      await alice.locator('[data-testid="tools-sidebar-collapse-btn"]').click();
      await bobMask.click();
      await expect(bobMask).toHaveAttribute('aria-pressed', 'false');
      await bobToFrance.click();
      await expect(bobToFrance).toHaveAttribute('aria-pressed', 'false');
      await send(bob, 'Germany agrees to the peace.');
      const railButton = alice.locator('[data-testid="tools-rail-press-btn"]');
      await expect(railButton.locator('[data-testid="press-unread-badge"]')).toHaveText('1');
      await recorder.recordStep(alice, 'collapsed_rail_unread_badge');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });

  test('phone: unread badge on the tools button and Press in the drawer', async ({
    browser,
  }) => {
    const recorder = new ScenarioRecorder('press_phone');
    const matchName = `Press phone ${Date.now()}`;
    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName, true);
      recorder.attachListeners(alice);
      await expect(alice.locator('[data-layout]')).toHaveAttribute('data-layout', 'compact');

      // A message arrives while the drawer is closed: the ≡ button shows it, unread.
      await api(BOB, `/api/press?game_id=${gameId}`, {
        power: 'GERMANY',
        recipients: [],
        anonymous: false,
        body: 'Germany proposes peace in the west. Hands off Burgundy.',
      });
      const toolsButton = alice.locator('[data-testid="compact-tools-toggle"]');
      await expect(toolsButton.locator('[data-testid="press-unread-badge"]')).toHaveText('1');
      await recorder.recordStep(alice, 'phone_unread_badge_on_tools_button');

      // Opening the drawer shows the section; once it is on screen the message is read.
      await toolsButton.click();
      const section = alice.locator('[data-testid="press-section"]');
      await section.scrollIntoViewIfNeeded();
      await expect(messages(alice)).toHaveCount(1);
      await expect(alice.locator('[data-testid="press-unread-total"]')).toHaveCount(0);
      await recorder.recordStep(alice, 'phone_press_in_tools_drawer');

      // Germany's letter button is big enough for a finger, and lights when tapped.
      const toGermany = alice.locator('[data-testid="press-recipient-GERMANY"]:visible');
      await toGermany.scrollIntoViewIfNeeded();
      const box = await toGermany.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(32);
      await toGermany.tap();
      await expect(toGermany).toHaveAttribute('aria-pressed', 'true');
      await expect(alice.locator('[data-testid="press-destination"]:visible')).toHaveText(
        'Private to Germany.',
      );
      await recorder.recordStep(alice, 'phone_letter_button_lit_on_standings');
      await toGermany.tap();
      await section.scrollIntoViewIfNeeded();

      // The page never scrolls sideways.
      const widths = await alice.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(widths.scroll).toBe(widths.inner);

      // Tapping a province closes the drawer and lights the province on the map.
      await alice
        .locator('[data-testid="press-province-link"][data-province="BUR"]')
        .tap();
      await expect(alice.locator('[data-testid="tools-drawer-layer"]')).not.toHaveAttribute(
        'data-open',
        'true',
      );
      await recorder.recordStep(alice, 'phone_province_tap_shows_map');

      recorder.finalize('PASSED');
    } catch (error) {
      recorder.finalize('FAILED');
      throw error;
    }
  });
});
