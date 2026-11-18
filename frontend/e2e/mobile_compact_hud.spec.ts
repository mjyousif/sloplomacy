// @scenario mobile
// @order 6
// @description Phone (390x844, touch): full-width map, order sheet, ≡ tools drawer, unified top bar (TurnChronicle, GameSettingsMenu, AccountDropdownMenu), docked unit bar, card-to-map selection, a move by tap, a winter build, past-turn history from the top bar, the lobby's Host and Join dialogs, and back to the lobby.
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

      await expect(page.locator('[data-layout]')).toHaveAttribute('data-layout', 'compact');
      await expect(page.locator('[data-testid="compact-top-bar"]')).toBeVisible();
      // Unified TurnChronicle sits inline in the phone top bar.
      const topTurnSelect = page.locator('[data-testid="turn-history-select"]');
      await expect(topTurnSelect).toContainText('Spring 1901');
      await expect(topTurnSelect).toContainText('Movement');

      // The map spans the screen: no sidebar rails on a phone.
      await expect(
        page.locator(
          '[data-testid="tools-sidebar-collapsed"], [data-testid="macro-sidebar-collapsed"]',
        ),
      ).toHaveCount(0);
      const mapBox = await page.locator('[data-testid="map-viewport-container"]').boundingBox();
      expect(mapBox).not.toBeNull();
      expect(mapBox!.width).toBeGreaterThanOrEqual(380);
      await expectNoSidewaysScroll(page);

      // The order sheet starts lowered, showing the controls a player needs every turn,
      // and the StatusBadge reports the warning in the sheet peek.
      expect(await sheetSnap(page)).toBe('peek');
      await expect(page.locator('[data-testid="status-badge"]')).toContainText('1 Issue');
      await expect(page.locator('[data-testid="btn-clear-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-finalize-orders"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-adjudicate-phase"]')).toBeVisible();
      await expect(page.locator('[data-testid="macro-sheet-counts"]')).toContainText('3 units');
      await recorder.recordStep(page, '01_phone_board_with_sheet_at_peek');

      // 2. Finalizing with a warning opens the order check modal.
      await page.locator('[data-testid="btn-finalize-orders"]').tap();
      const sanityModal = page.locator('[data-testid="sanity-check-modal"]');
      await expect(sanityModal).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_order_check_from_finalize');
      await page.locator('[data-testid="btn-sanity-back"]').tap();
      await expect(sanityModal).toHaveCount(0);

      // 3. The shared AccountDropdownMenu (Switch Game & Display Settings) and GameSettingsMenu (Sandbox controls).
      const accountTrigger = page.locator('[data-testid="account-menu-trigger"]');
      await accountTrigger.tap();
      await expect(page.locator('[data-testid="account-menu-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="account-menu-change-game"]')).toBeVisible();
      await page.locator('[data-testid="account-menu-display-settings"]').tap();
      await expect(page.locator('[data-testid="account-menu-back"]')).toBeVisible();
      await recorder.recordStep(page, '03_menu_display_settings');
      await page.locator('[data-testid="account-menu-back"]').tap();
      await accountTrigger.tap();
      await expect(page.locator('[data-testid="account-menu-panel"]')).toHaveCount(0);

      const gameSettingsTrigger = page.locator('[data-testid="game-settings-trigger"]');
      await gameSettingsTrigger.tap();
      await expect(page.locator('[data-testid="game-settings-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="game-settings-save-sandbox"]')).toBeVisible();
      await expect(page.locator('[data-testid="game-settings-reset-sandbox"]')).toBeVisible();
      await recorder.recordStep(page, '03b_game_settings_sandbox');
      await gameSettingsTrigger.tap();
      await expect(page.locator('[data-testid="game-settings-panel"]')).toHaveCount(0);

      // 4. ≡ opens the tools drawer. It has no zoom section and no duplicate turn history footer.
      const toolsToggle = page.locator('[data-testid="compact-tools-toggle"]');
      await toolsToggle.tap();
      const drawerLayer = page.locator('[data-testid="tools-drawer-layer"]');
      await expect(drawerLayer).toHaveAttribute('data-open', 'true');
      await expect(page.locator('[data-testid="tools-drawer"]')).toBeVisible();
      await expect(page.locator('[data-testid="tools-drawer"] [data-testid="tools-zoom-toolbar"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="tools-drawer"] [data-testid="turn-history"]')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Map zoom' })).toHaveCount(1);
      await recorder.recordStep(page, '04_tools_drawer_open');

      // Opening the account menu while ≡ is open must render the popover above the drawer, not underneath it.
      await accountTrigger.tap();
      const drawerAccountPanel = page.locator('[data-testid="account-menu-panel"]');
      await expect(drawerAccountPanel).toBeVisible();
      const menuOnTop = await drawerAccountPanel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + Math.min(24, rect.height / 2),
        );
        return Boolean(hit && (hit === el || el.contains(hit)));
      });
      expect(menuOnTop).toBe(true);
      await accountTrigger.tap();
      await expect(drawerAccountPanel).toHaveCount(0);

      // Tapping the backdrop beside it closes it and hands focus back to ≡.
      await page.touchscreen.tap(375, 500);
      await expect(drawerLayer).not.toHaveAttribute('data-open', 'true');
      await expect(toolsToggle).toBeFocused();

      // 5. Raise the sheet with its handle, then pick Paris from its card.
      await page.locator('[data-testid="bottom-sheet-handle"]').tap();
      await expect.poll(() => sheetSnap(page)).toBe('half');
      await recorder.recordStep(page, '05_sheet_raised_to_half');

      // Tapping an order-type tab inside the raised sheet keeps the sheet open for inline editing
      // and renders a dark-styled native <select> of touch height.
      const brestCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_F_BRE"]');
      await brestCard.locator('[data-testid="btn-order-type-HOLD"]').tap();
      expect(await sheetSnap(page)).toBe('half');
      await brestCard.locator('[data-testid="btn-order-type-MOVE"]').tap();
      expect(await sheetSnap(page)).toBe('half');
      const brestTarget = brestCard.locator('[data-testid="select-order-target"]');
      await expect(brestTarget).toBeVisible();
      const brestSelectMetrics = await brestTarget.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return { bg: style.backgroundColor, height: rect.height };
      });
      expect(brestSelectMetrics.height).toBeGreaterThanOrEqual(36);
      expect(brestSelectMetrics.bg).not.toBe('rgb(255, 255, 255)');
      expect(brestSelectMetrics.bg).not.toBe('rgba(0, 0, 0, 0)');
      await brestTarget.selectOption('PIC');
      await expect(brestCard.locator('[data-testid="behavior-target-text"]')).toContainText('Picardy');
      await brestTarget.selectOption('MAO');
      expect(await sheetSnap(page)).toBe('half');

      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      // The header, not the order controls inside the card, which keep their own taps.
      await parisCard.locator('[data-testid="unit-card-header"]').tap();
      await expect(parisCard).toHaveAttribute('data-selected', 'true');
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
      await expect(
        parisCard.locator('[data-testid="behavior-target-text"]'),
      ).toContainText('Picardy');
      // No problems left: the sheet StatusBadge returns to Drafting.
      await expect(page.locator('[data-testid="status-badge"]')).toContainText('Drafting');
      await recorder.recordStep(page, '07_paris_to_picardy_by_tap');

      // 6b. Verify Compact spacing in Display Settings renders cleanly inside the raised sheet.
      await accountTrigger.tap();
      await page.locator('[data-testid="account-menu-display-settings"]').tap();
      const spacingFieldset = page
        .locator('[data-testid="account-menu-panel"] fieldset')
        .filter({ hasText: 'Spacing' });
      await spacingFieldset.locator('label', { hasText: 'Compact' }).tap();
      await page.locator('[data-testid="account-menu-back"]').tap();
      await accountTrigger.tap();
      await expect(page.locator('[data-testid="account-menu-panel"]')).toHaveCount(0);

      await page.locator('[data-testid="bottom-sheet-handle"]').tap();
      await expect.poll(() => sheetSnap(page)).toBe('half');
      await expect(page.locator('[data-testid="unit-compact-row"]')).toHaveCount(3);
      await brestCard.locator('[data-testid="btn-order-type-MOVE"]').tap();
      const compactTarget = brestCard.locator('[data-testid="select-order-target"]');
      await expect(compactTarget).toBeVisible();
      await expect(compactTarget).toHaveAttribute('data-compact', 'true');
      const compactSelectBox = await compactTarget.boundingBox();
      expect(compactSelectBox?.height).toBeGreaterThanOrEqual(34);
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '07b_compact_orders_sheet');
      await brestCard.locator('[data-testid="btn-order-type-HOLD"]').tap();

      await accountTrigger.tap();
      await page.locator('[data-testid="account-menu-display-settings"]').tap();
      await spacingFieldset.locator('label', { hasText: 'Normal' }).tap();
      await page.locator('[data-testid="account-menu-back"]').tap();
      await accountTrigger.tap();

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

  test('opens Host game as a dialog that fits the phone', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_lobby_dialogs');
    recorder.attachListeners(page);

    try {
      await page.goto('/');
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await page.getByRole('button', { name: 'Host game' }).tap();
      const hostDialog = page.getByRole('dialog', { name: 'Host game' });
      await expect(hostDialog).toBeVisible();
      const box = await hostDialog.boundingBox();
      const viewport = page.viewportSize();
      expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
      expect(box && viewport && box.y >= 0 && box.y + box.height <= viewport.height).toBe(true);
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '01_host_game_dialog');
      await page.getByRole('button', { name: 'Close Host game' }).tap();
      await expect(hostDialog).toHaveCount(0);

      await page.getByRole('button', { name: 'Join with code' }).tap();
      await expect(page.getByRole('dialog', { name: 'Join with code' })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '02_join_with_code_dialog');

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
      const turnSelect = page.locator('[data-testid="turn-history-select"]');
      await expect(turnSelect).toContainText('Winter 1901');
      await expect(turnSelect).toContainText('Adjustments');
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
      await expect(
        parBuild.locator('[data-testid="btn-build-army"]'),
      ).toHaveAttribute('data-active', 'true');
      await recorder.recordStep(page, '02_army_built_in_paris');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });

  test('looks back at a past turn from the top-bar chronicle', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_turn_history');
    recorder.attachListeners(page);

    try {
      await playBurgundyBounce();
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      // The unified turn chronicle sits in the phone top bar; the drawer has no duplicate selector.
      const topBarChronicle = page.locator('[data-testid="compact-top-bar"] [data-testid="turn-history"]');
      await expect(topBarChronicle).toBeVisible();
      await expect(
        page.locator('[data-testid="tools-drawer"] [data-testid="turn-history"]'),
      ).toHaveCount(0);

      // Open the top-bar turn dropdown and pick Spring 1901 Movement.
      await topBarChronicle.locator('[data-testid="turn-history-select"]').tap();
      const optionZero = page.locator('[data-testid="turn-history-option-0"]');
      await expect(optionZero).toBeVisible();
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '01_history_dropdown_in_topbar');
      await optionZero.tap();

      await expect(page.locator('[data-testid="turn-history-pill"]')).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-chronicle-pill"]'),
      ).toHaveAttribute('data-viewing-past', 'true');
      const liveBtn = page.locator('[data-testid="turn-history-live"]');
      await expect(liveBtn).toBeVisible();
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
      await recorder.recordStep(page, '02_past_turn_with_topbar_chronicle');

      // Raise the sheet on the past turn to inspect the Nation/Action filter rows and order log.
      await page.locator('[data-testid="bottom-sheet-handle"]').tap();
      await expect.poll(() => sheetSnap(page)).toBe('half');
      await expect(
        page.locator('[data-testid="turn-history-clear-powers"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="turn-history-clear-actions"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="history-orders-section"]'),
      ).toBeVisible();
      await expectNoSidewaysScroll(page);
      await recorder.recordStep(page, '03_past_turn_sheet_raised');

      await liveBtn.tap();
      await expect(liveBtn).toHaveCount(0);
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toHaveCount(0);
      await expect(
        topBarChronicle.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Fall 1901');
      await recorder.recordStep(page, '04_back_to_live');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
