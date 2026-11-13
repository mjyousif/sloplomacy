// @scenario collapsible_sidebar
// @order 8
// @description Verify collapsible sections for Sandbox and Creator Admin Tools in ToolsSidebar.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Collapsible Sidebar Sections', () => {
  test('collapses and expands sandbox and creator admin sections', async ({ page }) => {
    const recorder = new ScenarioRecorder('collapsible_sidebar');
    recorder.attachListeners(page);

    try {
      // 1. Seed fresh standard board with FRANCE active
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');

      // 2. Start at Lobby view and enter Solo Sandbox
      await page.goto('/');
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await page.locator('[data-testid="btn-enter-sandbox"]').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      // Ensure ToolsSidebar is loaded
      const sidebar = page.locator('.tools-sidebar');
      await expect(sidebar).toBeVisible();

      // Find the toggle buttons for sections (Creator Admin Tools moved to Display Settings)
      const legendToggle = page.locator('.sidebar-section-toggle-btn:has-text("TACTICAL MAP LEGEND")');
      const powersToggle = page.locator('.sidebar-section-toggle-btn:has-text("COMMAND NATION")');
      const sandboxToggle = page.locator('.sidebar-section-toggle-btn:has-text("HYPOTHETICAL MODE")');
      const adminToggle = page.locator('.sidebar-section-toggle-btn:has-text("CREATOR ADMIN TOOLS")');

      await expect(legendToggle).toBeVisible();
      await expect(powersToggle).toBeVisible();
      await expect(sandboxToggle).toBeVisible();
      await expect(adminToggle).toHaveCount(0);

      // 1. Initial State: All expanded
      await recorder.recordStep(page, '01_all_sections_expanded');

      // 2. Enter Hypothetical Mode so ACTIVE badge is visible
      const enterSandboxBtn = page.locator('[data-testid="btn-toggle-sandbox"]');
      await enterSandboxBtn.click();
      const activePill = page.locator('.sandbox-live-pill');
      await expect(activePill).toBeVisible();

      await recorder.recordStep(page, '02_hypothetical_mode_active');

      // 3. Collapse Sandbox section
      await sandboxToggle.click();
      await page.waitForTimeout(300);
      // Content should now be collapsed (btn-toggle-sandbox should not be visible)
      await expect(enterSandboxBtn).not.toBeVisible();
      // But the ACTIVE pill in the header should still be visible!
      await expect(activePill).toBeVisible();

      // 4. Verify Administrator modes live in the top bar Administrator dropdown
      const adminMenuBtn = page.locator('[data-testid="btn-admin-menu"]');
      await expect(adminMenuBtn).toBeVisible();
      await adminMenuBtn.click();
      await expect(page.locator('[data-testid="display-settings-admin-group"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-open-admin-console"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-toggle-direct-edit"]')).toBeVisible();

      await recorder.recordStep(page, '03_sandbox_collapsed_and_display_admin_menu');

      // Close Administrator dropdown
      await adminMenuBtn.click();

      // 5. Expand Sandbox back open
      await sandboxToggle.click();
      await page.waitForTimeout(300);
      await expect(enterSandboxBtn).toBeVisible();

      await recorder.recordStep(page, '04_sandbox_re_expanded');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});

