import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 03: Tactical Blunder Detection & Sanity Check Modal', () => {
  test('flags self-bounce blunders, gates premature finalization, and allows override', async ({ page }) => {
    const recorder = new ScenarioRecorder('blunder_sanity_modal');
    recorder.attachListeners(page);

    try {
      // 1. Seed tactical blunders demo with FRANCE active
      await seedScenario('tactical_blunders_demo', 'proto_1901', 'FRANCE');

      // 2. Load sandbox view
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_blunder_board_loaded');

      // 3. Attempt to finalize orders with warnings active
      const finalizeBtn = page.locator('[data-testid="btn-finalize-orders"]');
      await expect(finalizeBtn).toBeVisible();
      await finalizeBtn.click();

      // 4. Verify Sanity Check Modal appears
      const modal = page.locator('[data-testid="sanity-check-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_sanity_check_modal_opened');

      // 5. Test modal dismissal ("Go Back & Revise Orders")
      const backBtn = page.locator('[data-testid="btn-sanity-back"]');
      await expect(backBtn).toBeVisible();
      await backBtn.click();
      await expect(modal).toHaveCount(0);
      await recorder.recordStep(page, '03_modal_dismissed');

      // 6. Finalize again and click "Finalize Anyway" override
      await finalizeBtn.click();
      await expect(modal).toBeVisible();
      const forceConfirmBtn = page.locator('[data-testid="btn-sanity-force-confirm"]');
      await expect(forceConfirmBtn).toBeVisible();
      await forceConfirmBtn.click();

      // 7. Verify orders are locked / finalized
      const unfinalizeBtn = page.locator('[data-testid="btn-unfinalize-orders"]');
      await expect(unfinalizeBtn).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '04_orders_force_finalized');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
