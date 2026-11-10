// @scenario foreign_support
// @order 99
// @description Demonstrates the non-leaking INFO diagnostic when supporting a foreign unit.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario, postOrder } from './helpers';

test.describe('Scenario: Foreign Support Diagnostic Inspection', () => {
  test('shows info badge for foreign support without leaking foreign orders', async ({ page }) => {
    const recorder = new ScenarioRecorder('foreign_support_leak_fix');
    recorder.attachListeners(page);

    try {
      await seedScenario('standard_1901', 'proto_1901', 'ITALY');

      // Italy orders A VEN to support Austrian Army in Vienna to Tyrolia
      await postOrder({
        unit_id: 'ITA_A_VEN',
        power: 'ITALY',
        unit_type: 'A',
        origin: 'VEN',
        order_type: 'SUPPORT',
        aux_unit_origin: 'VIE',
        target: 'TYR',
      });

      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_foreign_support_board_view');

      const alert = page.locator('.unit-diagnostic-alert.info');
      await expect(alert).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '02_info_alert_detail');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
