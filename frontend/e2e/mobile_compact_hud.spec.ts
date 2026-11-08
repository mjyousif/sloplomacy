import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 06: Mobile Compact HUD & Responsive Viewport', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Standard phone viewport (e.g. iPhone 12/13/14)
  });

  test('verifies compact top bar, visible map canvas between slim rails, order problem modal, 3-dots display settings menu, drawer toggle, and back navigation', async ({ page }) => {
    const recorder = new ScenarioRecorder('mobile_compact_hud');
    recorder.attachListeners(page);

    try {
      // 1. Seed tactical blunders demo with FRANCE active (has 1 self-bounce warning issue in Burgundy)
      await seedScenario('tactical_blunders_demo', 'proto_1901', 'FRANCE');

      // 2. Load sandbox view in mobile viewport
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      // Verify compact data-layout attribute is set on the app shell
      const appShell = page.locator('.diplomacy-app-shell');
      await expect(appShell).toHaveAttribute('data-layout', 'compact');

      // Verify CompactTopBar is visible
      const compactBar = page.locator('[data-testid="compact-top-bar"]');
      await expect(compactBar).toBeVisible();

      // Verify turn text in compact bar
      const turnText = page.locator('[data-testid="compact-turn-text"]');
      await expect(turnText).toBeVisible();
      await expect(turnText).toContainText(/Spring 1901 · Movement/i);

      // Verify European map is clearly visible between slim rails (NOT crushed to 0px)
      const mapContainer = page.locator('[data-testid="map-viewport-container"]');
      await expect(mapContainer).toBeVisible();
      const mapBox = await mapContainer.boundingBox();
      expect(mapBox).not.toBeNull();
      expect(mapBox!.width).toBeGreaterThan(250); // Map must have substantial room on mobile

      // Verify both sidebars default to slim collapsed 44px rails on phones
      const toolsExpandBtn = page.locator('[data-testid="tools-sidebar-expand-btn"]');
      const macroExpandBtn = page.locator('[data-testid="macro-sidebar-expand-btn"]');
      await expect(toolsExpandBtn).toBeVisible();
      await expect(macroExpandBtn).toBeVisible();

      await recorder.recordStep(page, '01_mobile_board_loaded_with_visible_map');

      // 3. Inspect the order problem badge (1 tactical warning: self-bounce in Burgundy)
      const issueBadge = page.locator('[data-testid="compact-issue-badge"]');
      await expect(issueBadge).toBeVisible();
      await expect(issueBadge).toContainText('1');

      // Tap the issue badge to trigger the order check / SanityCheckModal
      await issueBadge.click();
      const sanityModal = page.locator('[data-testid="sanity-check-modal"]');
      await expect(sanityModal).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_mobile_sanity_modal_opened_from_badge');

      // Dismiss the sanity modal via "Go Back & Revise Orders"
      const backBtn = page.locator('[data-testid="btn-sanity-back"]');
      await expect(backBtn).toBeVisible();
      await backBtn.click();
      await expect(sanityModal).toHaveCount(0);
      await recorder.recordStep(page, '03_mobile_sanity_modal_dismissed');

      // 4. Open the 3-dots (...) menu in CompactTopBar
      const menuToggle = page.locator('[data-testid="compact-menu-toggle"]');
      await expect(menuToggle).toBeVisible();
      await menuToggle.click();

      const menuPanel = page.locator('[data-testid="compact-menu-panel"]');
      await expect(menuPanel).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '04_mobile_menu_panel_opened');

      // Navigate to Display Settings sub-view
      const displaySettingsBtn = page.locator('[data-testid="compact-menu-display-settings"]');
      await expect(displaySettingsBtn).toBeVisible();
      await displaySettingsBtn.click();

      // Verify sub-view back button is visible, then go back to main menu view
      const menuBackBtn = page.locator('[data-testid="compact-menu-display-back"]');
      await expect(menuBackBtn).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '05_mobile_display_settings_subview');
      await menuBackBtn.click();
      await expect(displaySettingsBtn).toBeVisible();

      // Close menu by tapping toggle again
      await menuToggle.click();
      await expect(menuPanel).toHaveCount(0);
      await recorder.recordStep(page, '06_mobile_menu_closed');

      // 5. Expand Macro Sidebar as an overlay drawer and select French Army in Paris
      await macroExpandBtn.click();
      const macroSidebar = page.locator('[data-testid="macro-sidebar"]');
      await expect(macroSidebar).toBeVisible();

      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      await expect(parisCard).toBeVisible({ timeout: 5000 });
      await parisCard.click();
      await recorder.recordStep(page, '07_mobile_macro_drawer_opened_and_unit_selected');

      // Collapse the Macro Sidebar drawer back to rail
      const macroCollapseBtn = page.locator('[data-testid="macro-sidebar-collapse-btn"]');
      await expect(macroCollapseBtn).toBeVisible();
      await macroCollapseBtn.click();
      await expect(macroExpandBtn).toBeVisible();
      await recorder.recordStep(page, '08_mobile_macro_drawer_collapsed');

      // 6. Navigate back to Lobby via top bar arrow
      const backLobbyBtn = page.locator('[data-testid="compact-back-lobby-btn"]');
      await expect(backLobbyBtn).toBeVisible();
      await backLobbyBtn.click();

      // Verify returned to lobby with compact layout and brand title
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      const compactBrand = page.locator('[data-testid="compact-brand"]');
      await expect(compactBrand).toBeVisible();
      await expect(compactBrand).toContainText(/Sloplomacy/i);
      await recorder.recordStep(page, '09_mobile_lobby_view_returned');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
