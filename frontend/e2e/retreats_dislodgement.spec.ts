import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 04: Dislodgement & Retreat Resolution', () => {
  test('detects dislodged units, orders valid retreat, and advances to Fall phase', async ({ page }) => {
    const recorder = new ScenarioRecorder('retreats_dislodgement');
    recorder.attachListeners(page);

    try {
      // 1. Seed spring retreats scenario with GERMANY active
      await seedScenario('spring_retreats_demo', 'proto_1901', 'GERMANY');

      // 2. Load sandbox
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      // Verify chronicle indicates retreats phase
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/RETREATS/i, { timeout: 10000 });
      await recorder.recordStep(page, '01_retreat_phase_loaded');

      // 3. Verify dislodged indicator exists
      const dislodgedRing = page.locator('[data-testid="dislodged-unit-indicator"][data-unit-id="GER_A_MUN"]');
      await expect(dislodgedRing).toBeVisible();

      // 4. Select dislodged unit
      const dislodgedUnit = page.locator('[data-testid="unit-token"][data-unit-id="GER_A_MUN"]');
      await expect(dislodgedUnit).toBeVisible();
      await dislodgedUnit.click();
      await recorder.recordStep(page, '02_dislodged_unit_selected');

      // 5. Select RETREAT order and destination Ruhr (RUH)
      const retreatBtn = page.locator('[data-testid="btn-order-retreat"]');
      await expect(retreatBtn).toBeVisible();
      await retreatBtn.click();

      const targetSelect = page.locator('[data-testid="select-retreat-target"]');
      await expect(targetSelect).toBeVisible();
      await targetSelect.selectOption('RUH');

      // Verify retreat order arrow is drawn on the map pointing to RUH
      const retreatArrow = page.locator(
        '[data-testid="order-arrow"][data-order-unit="GER_A_MUN"][data-order-type="RETREAT"][data-order-target="RUH"]'
      );
      await expect(retreatArrow).toBeVisible();
      await recorder.recordStep(page, '03_retreat_order_submitted');

      // 6. Adjudicate retreats
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.click();

      // 7. Verify advance to Fall 1901 Movement and that German army retreated to RUH
      await expect(turnPill).toContainText(/FALL 1901/i, { timeout: 10000 });
      const retreatedUnit = page.locator(
        '[data-testid="unit-token"][data-unit-power="GERMANY"][data-province="RUH"]'
      );
      await expect(retreatedUnit).toBeVisible();
      await recorder.recordStep(page, '04_fall_movement_advanced');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
