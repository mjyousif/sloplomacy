// @scenario admin_resolve_turn
// @description Host uses Administrator -> Resolve Turn with confirmation modal, advancing the match and warning other players via AdminActionWarningModal.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
  power: string;
}

const ALICE: Player = {
  id: 'local_admin_alice',
  email: 'admin.alice@example.com',
  name: 'Alice',
  power: 'FRANCE',
};

const BOB: Player = {
  id: 'local_admin_bob',
  email: 'admin.bob@example.com',
  name: 'Bob',
  power: 'ENGLAND',
};

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
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function createMatch(name: string): Promise<string> {
  const created = await api(ALICE, '/api/games', {
    name,
    creator_power: ALICE.power,
    user_id: ALICE.id,
    email: ALICE.email,
    display_name: ALICE.name,
  });
  await api(BOB, `/api/games/${created.game_id}/join`, {
    power: BOB.power,
    user_id: BOB.id,
    email: BOB.email,
    display_name: BOB.name,
  });
  return created.game_id;
}

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

test.describe('Scenario: Admin Resolve Turn override', () => {
  test('host confirms Resolve Turn from Administrator menu and other players receive warning modal', async ({
    browser,
  }) => {
    const rec = new ScenarioRecorder('admin_resolve_turn');
    const matchName = `Admin Resolve ${Date.now()}`;

    try {
      await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName);
      const bob = await openAs(browser, BOB, matchName);
      rec.attachListeners(alice);
      rec.attachListeners(bob);

      // 1. Multiplayer footer shows consensus card only (no inline host override button)
      await expect(
        alice.getByTestId('mp-consensus-status-card'),
      ).toBeVisible();
      await expect(alice.getByTestId('btn-creator-override')).toHaveCount(0);
      await rec.recordStep(alice, 'multiplayer_footer_no_override');

      // 2. Host opens Administrator submenu inside Game Settings and sees Resolve Turn
      await alice.getByTestId('game-settings-trigger').click();
      await alice.getByTestId('game-settings-admin-settings').click();
      await expect(alice.getByTestId('admin-settings-panel')).toBeVisible();
      await expect(alice.getByTestId('btn-admin-resolve-turn')).toBeVisible();
      await rec.recordStep(alice, 'admin_menu_resolve_turn');

      // 3. Clicking Resolve Turn opens the confirmation modal
      await alice.getByTestId('btn-admin-resolve-turn').click();
      await expect(
        alice.getByTestId('btn-confirm-modal-confirm'),
      ).toBeVisible();
      await expect(alice.getByRole('alertdialog')).toContainText(
        'Other players will be notified',
      );
      await rec.recordStep(alice, 'confirm_resolve_turn_modal');

      // 4. Confirming advances the match to Fall 1901 Movement
      await alice.getByTestId('btn-confirm-modal-confirm').click();
      await expect(alice.getByTestId('turn-chronicle-pill')).toContainText(
        'Fall 1901',
      );
      await rec.recordStep(alice, 'host_resolved_fall_1901');

      // 5. Bob receives the AdminActionWarningModal and acknowledges it
      await expect(
        bob.getByTestId('admin-action-warning-modal'),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        bob.getByTestId('admin-action-warning-modal'),
      ).toContainText('Force-resolved Spring 1901 Movement Phase.');
      await rec.recordStep(bob, 'player_admin_warning_modal');

      await bob.getByTestId('admin-warning-acknowledge-btn').click();
      await expect(
        bob.getByTestId('admin-action-warning-modal'),
      ).toHaveCount(0);

      // 6. Phone top bar menu also exposes Resolve Turn for the host
      const alicePhone = await openAs(browser, ALICE, matchName, true);
      rec.attachListeners(alicePhone);
      await alicePhone.getByTestId('compact-menu-toggle').click();
      await expect(
        alicePhone.getByTestId('btn-admin-resolve-turn'),
      ).toBeVisible();
      await rec.recordStep(alicePhone, 'mobile_admin_menu_resolve_turn');
      rec.finalize('PASSED');
    } catch (error) {
      rec.finalize('FAILED');
      throw error;
    }
  });
});
