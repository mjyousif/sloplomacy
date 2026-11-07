import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 05: Winter Adjustments & Unit Builds', () => {
  test('verifies winter adjustments phase, build slots, and advances to Spring 1902', async ({ page }) => {
    const recorder = new ScenarioRecorder('winter_builds');
    recorder.attachListeners(page);

    try {
      // 1. Seed winter adjustments demo
      await seedScenario('winter_adjustments_demo', 'proto_1901');

      // 2. Load sandbox view
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      // Verify chronicle indicates winter adjustments
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/WINTER 1901.*ADJUSTMENTS/i, { timeout: 10000 });
      await recorder.recordStep(page, '01_winter_adjustments_loaded');

      // 3. Verify build cards in MacroSidebar
      const buildCard = page.locator('[data-testid="build-macro-card"]').first();
      await expect(buildCard).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_build_cards_displayed');

      // 4. Resolve adjustments
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.click();

      // 5. Verify advance to Spring 1902 Movement
      await expect(turnPill).toContainText(/SPRING 1902.*MOVEMENT/i, { timeout: 10000 });
      await recorder.recordStep(page, '03_spring_1902_advanced');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
