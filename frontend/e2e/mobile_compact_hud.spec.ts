// @scenario mobile
// @order 6
// @description Phone (390x844, touch): full-width map, order sheet, ≡ tools drawer, docked unit bar, card-to-map selection, a move by tap, a winter build, a past turn from the drawer, and back to the lobby.
import { test, expect, Page } from '@playwright/test';
import { ScenarioRecorder, playBurgundyBounce, seedScenario } from './helpers';

/** The page never scrolls sideways, the most common way a phone layout breaks. */
async function expectNoSidewaysScroll(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(widths.scroll).toBe(widths.inner);
}

async function sheetSnap(page: Page): Promise<string | null> {
  return page.locator('[data-testid="macro-sidebar"]').getAttribute('data-snap');
}

test.describe('Scenario 06: Phone game screen', () => {
  // Touch, so taps arrive as touch pointer events: the hover rules and the map's pointer code
  // run the way they do on a real phone.
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('plays a move from the order sheet and the map, and opens the tools drawer', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_compact_hud');
    recorder.attachListeners(page);

    try {
      // 1. France with one problem: Paris and Marseilles both move to Burgundy and bounce.
      await seedScenario('tactical_blunders_demo', 'proto_1901', 'FRANCE');
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      await expect(page.locator('.diplomacy-app-shell')).toHaveAttribute('data-layout', 'compact');
      await expect(page.locator('[data-testid="compact-top-bar"]')).toBeVisible();
      // Two lines on screen, but it still reads as one label.
      await expect(page.locator('[data-testid="compact-turn-text"]')).toContainText('Spring 1901 · Movement');

      // The map spans the screen: no sidebar rails on a phone.
      await expect(page.locator('.tools-sidebar-collapsed, .macro-sidebar-collapsed')).toHaveCount(0);
      const mapBox = await page.locator('[data-testid="map-viewport-container"]').boundingBox();
      expect(mapBox).not.toBeNull();
      expect(mapBox!.width).toBeGreaterThanOrEqual(380);
      await expectNoSidewaysScroll(page);

      // The order sheet starts lowered, showing the controls a player needs every turn.
      expect(await sheetSnap(page)).toBe('peek');
      await expect(page.locator('[data-testid="btn-confirm-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-finalize-orders"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-adjudicate-phase"]')).toBeVisible();
      await expect(page.locator('[data-testid="macro-sheet-counts"]')).toContainText('3 units');
      await recorder.recordStep(page, '01_phone_board_with_sheet_at_peek');

      // 2. The problem badge opens the order check.
      const issueBadge = page.locator('[data-testid="compact-issue-badge"]');
      await expect(issueBadge).toContainText('1');
      await issueBadge.tap();
      const sanityModal = page.locator('[data-testid="sanity-check-modal"]');
      await expect(sanityModal).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_order_check_from_badge');
      await page.locator('[data-testid="btn-sanity-back"]').tap();
      await expect(sanityModal).toHaveCount(0);

      // 3. The ⋯ menu and its display settings.
      const menuToggle = page.locator('[data-testid="compact-menu-toggle"]');
      await menuToggle.tap();
      await expect(page.locator('[data-testid="compact-menu-panel"]')).toBeVisible();
      await page.locator('[data-testid="compact-menu-display-settings"]').tap();
      await expect(page.locator('[data-testid="compact-menu-display-back"]')).toBeVisible();
      await recorder.recordStep(page, '03_menu_display_settings');
      await page.locator('[data-testid="compact-menu-display-back"]').tap();
      await menuToggle.tap();
      await expect(page.locator('[data-testid="compact-menu-panel"]')).toHaveCount(0);

      // 4. ≡ opens the tools drawer. It has no zoom section, since the zoom buttons are on the map.
      const toolsToggle = page.locator('[data-testid="compact-tools-toggle"]');
      await toolsToggle.tap();
      const drawerLayer = page.locator('.tools-drawer-layer');
      await expect(drawerLayer).toHaveClass(/open/);
      await expect(page.locator('[data-testid="tools-drawer"]')).toBeVisible();
      await expect(page.locator('[data-testid="tools-drawer"] .tools-zoom-toolbar')).toHaveCount(0);
      await expect(page.locator('.map-zoom-controls')).toHaveCount(1);
      await recorder.recordStep(page, '04_tools_drawer_open');

      // Tapping the backdrop beside it closes it and hands focus back to ≡.
      await page.touchscreen.tap(375, 500);
      await expect(drawerLayer).not.toHaveClass(/open/);
      await expect(toolsToggle).toBeFocused();

      // 5. Raise the sheet with its handle, then pick Paris from its card.
      await page.locator('[data-testid="bottom-sheet-handle"]').tap();
      await expect.poll(() => sheetSnap(page)).toBe('half');
      await recorder.recordStep(page, '05_sheet_raised_to_half');

      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      // The header, not the order controls inside the card, which keep their own taps.
      await parisCard.locator('.unit-card-header').tap();
      await expect(parisCard).toHaveClass(/selected/);
      // The sheet gets out of the way and the docked bar takes the unit's orders.
      await expect.poll(() => sheetSnap(page)).toBe('peek');
      const dockedBar = page.locator('[data-testid="unit-docked-bar"]');
      await expect(dockedBar).toBeVisible();
      await expect(dockedBar).toContainText('Army Paris');
      await expect(dockedBar).toContainText('Tap a green province to Move');

      // Paris is kept clear of the bar so its neighbours can be tapped.
      const barBox = await dockedBar.boundingBox();
      const parisBox = await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]')
        .boundingBox();
      expect(parisBox!.y + parisBox!.height).toBeLessThan(barBox!.y);
      await recorder.recordStep(page, '06_paris_selected_from_card_docked_bar');

      // 6. Move Paris to Picardy by tapping the province, which also ends the bounce.
      const picardy = page.locator('[data-testid="reachable-reticle"][data-province-id="PIC"]');
      await expect(picardy).toHaveCount(1);
      await picardy.tap();
      await expect(dockedBar).toHaveCount(0);
      // The order line, not the whole card: its Destination list always names Picardy.
      await expect(parisCard.locator('.behavior-target-text')).toContainText('Picardy');
      // No problems left: the tappable count gives way to a plain check.
      await expect(page.locator('[data-testid="compact-issue-badge"]')).toHaveCount(0);
      await expect(page.locator('.compact-issue-badge.is-clean')).toBeVisible();
      await recorder.recordStep(page, '07_paris_to_picardy_by_tap');

      // 7. Back to the lobby.
      await page.locator('[data-testid="compact-back-lobby-btn"]').tap();
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await expect(page.locator('[data-testid="compact-brand"]')).toContainText(/Sloplomacy/i);
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '08_lobby_returned');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });

  test('builds an army in a winter adjustment through the docked bar', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_winter_build');
    recorder.attachListeners(page);

    try {
      await seedScenario('winter_adjustments_demo', 'proto_1901', 'FRANCE');
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="build-token"]', { timeout: 15000 });
      await expect(page.locator('[data-testid="compact-turn-text"]')).toContainText('Winter 1901 · Adjustments');
      await expectNoSidewaysScroll(page);

      // Tap the open home centre in Paris on the map.
      await page.locator('[data-testid="build-token"][data-home-province="PAR"]').tap();
      const dockedBar = page.locator('[data-testid="unit-docked-bar"]');
      await expect(dockedBar).toBeVisible();
      await expect(dockedBar).toContainText('Build in Paris');
      expect(await sheetSnap(page)).toBe('peek');
      await recorder.recordStep(page, '01_build_slot_in_docked_bar');

      await dockedBar.getByRole('button', { name: '+ Army' }).tap();
      await expect(dockedBar).toHaveCount(0);

      // The build shows on the sheet's card once it is raised.
      await page.locator('[data-testid="bottom-sheet-handle"]').tap();
      await expect.poll(() => sheetSnap(page)).toBe('half');
      const parBuild = page.locator('[data-testid="build-macro-card"][data-home-province="PAR"]');
      await expect(parBuild.locator('[data-testid="btn-build-army"]')).toHaveClass(/active/);
      await recorder.recordStep(page, '02_army_built_in_paris');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });

  test('looks back at a past turn from the tools drawer', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_turn_history');
    recorder.attachListeners(page);

    try {
      await playBurgundyBounce();
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      // The selector sits at the foot of the ≡ drawer.
      await page.locator('[data-testid="compact-tools-toggle"]').tap();
      await expect(page.locator('.tools-drawer-layer')).toHaveClass(/open/);
      await expect(
        page.locator(
          '[data-testid="tools-drawer"] [data-testid="turn-history"]',
        ),
      ).toBeVisible();
      await recorder.recordStep(page, '01_history_in_drawer');

      // Picking a turn closes the drawer and puts a pill on the map to step or go back.
      await page
        .locator('[data-testid="turn-history-select"]')
        .selectOption('0');
      await expect(page.locator('.tools-drawer-layer')).not.toHaveClass(/open/);
      const pill = page.locator('[data-testid="turn-history-pill"]');
      await expect(pill).toContainText('S1901 M');
      await expect(
        page.locator(
          '[data-testid="order-arrow"][data-order-unit="GER_A_MUN"]',
        ),
      ).toContainText('BOUNCED');
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toBeVisible();
      await expectNoSidewaysScroll(page);

      // Nothing on a past turn can be picked up.
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]')
        .tap();
      await expect(page.locator('[data-testid="unit-docked-bar"]')).toHaveCount(
        0,
      );
      await recorder.recordStep(page, '02_past_turn_with_map_pill');

      await page.locator('[data-testid="turn-history-pill-live"]').tap();
      await expect(pill).toHaveCount(0);
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toHaveCount(0);
      await recorder.recordStep(page, '03_back_to_live');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
