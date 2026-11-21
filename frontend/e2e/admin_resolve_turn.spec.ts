// @scenario admin_resolve_turn
// @alias admin
// @alias admin_board_edit
// @description Host stages Direct-Edit board changes (ownership, spawn, relocate, undo) while another player orders and finalizes without 409, then force-resolves the turn; rival receives and acknowledges AdminActionWarningModal with unimpacted orders preserved.
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

test.describe('Scenario: Admin Resolve Turn override', () => {
  test('host confirms Resolve Turn from Administrator menu and other players receive warning modal', async ({
    browser,
  }) => {
    const rec = new ScenarioRecorder('admin_resolve_turn');
    const matchName = `Admin Resolve ${Date.now()}`;

    try {
      const gameId = await createMatch(matchName);
      const alice = await openAs(browser, ALICE, matchName);
      const bob = await openAs(browser, BOB, matchName);
      rec.attachListeners(alice);
      rec.attachListeners(bob);

      // 1. Multiplayer footer shows consensus card only (no inline host override button)
      await expect(alice.getByTestId('mp-consensus-status-card')).toBeVisible();
      await expect(alice.getByTestId('btn-creator-override')).toHaveCount(0);
      await rec.recordStep(alice, 'multiplayer_footer_no_override');

      // 1b. Alice plots an order on an unimpacted unit (FRA_A_PAR -> BUR) before editing the board
      await alice
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]')
        .click();
      await alice
        .locator('[data-testid="reachable-reticle"][data-province-id="BUR"]')
        .click();
      await expect(
        alice.locator(
          '[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"][data-order-type="MOVE"][data-order-target="BUR"]',
        ),
      ).toBeVisible();

      // 1c. Alice enters Edit Board mode via Administrator menu
      await alice.getByTestId('game-settings-trigger').click();
      await alice.getByTestId('game-settings-admin-settings').click();
      await alice.getByTestId('btn-toggle-direct-edit').click();
      await expect(alice.getByTestId('admin-sidebar-title')).toContainText(
        'Edit Board',
      );
      await expect(alice.getByTestId('admin-inspector-empty')).toBeVisible();
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '0 staged changes',
      );
      await rec.recordStep(alice, 'edit_board_opened');

      // 1d. Alice stages ownership (BEL -> France), unit spawn (FRA A BEL), unit relocate (MAR -> GAS), and tests Undo on FRA_F_BRE delete
      await alice
        .locator('[data-testid="province-path"][data-province-id="BEL"]')
        .click();
      await expect(alice.getByTestId('admin-tile-inspector')).toBeVisible();
      await alice.getByTestId('admin-inspector-ownership-select').click();
      await alice
        .getByTestId('admin-inspector-ownership-select-option-france')
        .click();
      await alice.getByTestId('admin-inspector-spawn-army').click();
      await alice.getByTestId('admin-inspector-spawn-power').click();
      await alice
        .getByTestId('admin-inspector-spawn-power-option-france')
        .click();
      await expect(
        alice.locator(
          '[data-testid="unit-token"][data-unit-id="FRA_A_BEL"][data-province="BEL"]',
        ),
      ).toBeVisible();

      await alice
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_MAR"]')
        .click();
      await alice.getByTestId('admin-inspector-relocate-btn').click();
      await alice
        .locator('[data-testid="province-path"][data-province-id="GAS"]')
        .click();
      await expect(
        alice.locator(
          '[data-testid="unit-token"][data-unit-id="FRA_A_MAR"][data-province="GAS"]',
        ),
      ).toBeVisible();

      await alice
        .locator('[data-testid="unit-token"][data-unit-id="FRA_F_BRE"]')
        .click();
      await alice.getByTestId('admin-inspector-destroy-btn').click();
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '4 staged changes',
      );

      await alice.getByTestId('admin-staged-count').click();
      await expect(alice.getByTestId('admin-staged-drawer')).toBeVisible();
      await alice.getByTestId('btn-admin-undo-change-0').click();
      await expect(
        alice.locator('[data-testid="unit-token"][data-unit-id="FRA_F_BRE"]'),
      ).toBeVisible();
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '3 staged changes',
      );
      await rec.recordStep(alice, 'edit_board_staged_changes');

      // 1e. While Alice has uncommitted board edits, Bob submits an order and finalizes (Issue #362)
      await bob
        .locator('[data-testid="unit-token"][data-unit-id="ENG_F_LON"]')
        .click();
      await bob
        .locator('[data-testid="reachable-reticle"][data-province-id="NTH"]')
        .click();
      await expect(
        bob.locator(
          '[data-testid="order-arrow"][data-order-unit="ENG_F_LON"][data-order-type="MOVE"][data-order-target="NTH"]',
        ),
      ).toBeVisible();
      await bob.getByTestId('btn-finalize-orders').click();
      const sanityModal = bob.getByTestId('sanity-check-modal');
      try {
        await sanityModal.waitFor({ state: 'visible', timeout: 1500 });
        await bob.getByTestId('btn-sanity-force-confirm').click();
      } catch {
        // No sanity check modal needed
      }
      await expect(bob.getByTestId('btn-unfinalize-orders')).toBeVisible({
        timeout: 5000,
      });
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '3 staged changes',
      );

      // 1f. Alice commits the batch board edit without 409; unimpacted orders & Fog of War are preserved
      await alice.getByTestId('btn-admin-apply-edits').click();
      await expect(alice.getByTestId('toast-banner')).toContainText(
        'Applied 3 admin board edits.',
        { timeout: 10000 },
      );
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '0 staged changes',
      );
      await expect(
        alice.locator(
          '[data-testid="unit-token"][data-unit-id="FRA_A_BEL"][data-province="BEL"]',
        ),
      ).toBeVisible();
      await expect(
        alice.locator(
          '[data-testid="unit-token"][data-unit-id="FRA_A_MAR"][data-province="GAS"]',
        ),
      ).toBeVisible();
      await expect(
        alice.locator(
          '[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"][data-order-type="MOVE"][data-order-target="BUR"]',
        ),
      ).toBeVisible();
      await expect(
        alice.locator(
          '[data-testid="order-arrow"][data-order-unit="ENG_F_LON"]',
        ),
      ).toHaveCount(0);
      await rec.recordStep(alice, 'edit_board_applied_orders_preserved');

      // 1g. Bob receives the board-edit AdminActionWarningModal, acknowledges it, and still keeps his ENG_F_LON -> NTH order
      await expect(bob.getByTestId('admin-action-warning-modal')).toBeVisible({
        timeout: 10000,
      });
      await expect(bob.getByTestId('admin-action-warning-modal')).toContainText(
        'Set ownership of Belgium to France',
      );
      await expect(bob.getByTestId('admin-action-warning-modal')).toContainText(
        'Spawned France Army at Belgium',
      );
      await expect(bob.getByTestId('admin-action-warning-modal')).toContainText(
        'Relocated France Army from Marseilles to Gascony',
      );
      await rec.recordStep(bob, 'player_board_edit_warning_modal');
      await bob.getByTestId('admin-warning-acknowledge-btn').click();
      await expect(bob.getByTestId('admin-action-warning-modal')).toHaveCount(
        0,
      );
      await expect(
        bob.locator(
          '[data-testid="order-arrow"][data-order-unit="ENG_F_LON"][data-order-type="MOVE"][data-order-target="NTH"]',
        ),
      ).toBeVisible();

      // 1h. Concurrent board change triggers 409 Conflict modal when Alice tries to apply staged edits
      await alice
        .locator('[data-testid="province-path"][data-province-id="HOL"]')
        .click();
      await alice.getByTestId('admin-inspector-ownership-select').click();
      await alice
        .getByTestId('admin-inspector-ownership-select-option-france')
        .click();
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '1 staged change',
      );

      const latest = (await api(ALICE, `/api/game?game_id=${gameId}`)).state;
      await api(ALICE, `/api/admin/board-edit?game_id=${gameId}`, {
        expected_revision: latest.board_revision,
        expected_season: latest.season,
        expected_year: latest.year,
        expected_phase: latest.phase,
        units: latest.units,
        ownership: { ...latest.ownership, SPA: 'FRANCE' },
      });

      await alice.getByTestId('btn-admin-apply-edits').click();
      const conflictDialog = alice.getByRole('alertdialog', {
        name: 'Board State Changed (409 Conflict)',
      });
      await expect(conflictDialog).toBeVisible({ timeout: 10000 });
      await expect(conflictDialog).toContainText(
        'Board state changed while editing. Please review the latest board state before applying changes.',
      );
      await expect(
        conflictDialog.getByTestId('btn-confirm-modal-confirm'),
      ).toHaveText('Discard Draft & Reload');
      await rec.recordStep(alice, 'edit_board_409_conflict_modal');

      await conflictDialog.getByTestId('btn-confirm-modal-confirm').click();
      await expect(conflictDialog).toHaveCount(0);
      await expect(alice.getByTestId('admin-staged-count')).toContainText(
        '0 staged changes',
      );

      // Acknowledge the concurrent board-edit warning on Bob's page before Resolve Turn
      await expect(bob.getByTestId('admin-action-warning-modal')).toBeVisible({
        timeout: 10000,
      });
      await bob.getByTestId('admin-warning-acknowledge-btn').click();
      await expect(bob.getByTestId('admin-action-warning-modal')).toHaveCount(
        0,
      );

      // 1i. Alice exits Edit Board mode
      await alice.getByTestId('game-settings-trigger').click();
      await alice.getByTestId('game-settings-admin-settings').click();
      await alice.getByTestId('btn-exit-admin-mode').click();

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
      await expect(bob.getByTestId('admin-action-warning-modal')).toBeVisible({
        timeout: 10000,
      });
      await expect(bob.getByTestId('admin-action-warning-modal')).toContainText(
        'Force-resolved Spring 1901 Movement Phase.',
      );
      await rec.recordStep(bob, 'player_admin_warning_modal');

      await bob.getByTestId('admin-warning-acknowledge-btn').click();
      await expect(bob.getByTestId('admin-action-warning-modal')).toHaveCount(
        0,
      );

      // 6. Phone top bar Game Settings -> Administrator also exposes Resolve Turn for the host
      const alicePhone = await openAs(browser, ALICE, matchName, true);
      rec.attachListeners(alicePhone);
      await alicePhone.getByTestId('game-settings-trigger').click();
      await alicePhone.getByTestId('game-settings-admin-settings').click();
      await expect(
        alicePhone.getByTestId('admin-settings-panel'),
      ).toBeVisible();
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
