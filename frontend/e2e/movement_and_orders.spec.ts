import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 01: Tactical Movement & Order Creation', () => {
  test('selects unit, creates move order, verifies arrow, switches to hold, and adjudicates', async ({ page }) => {
    const recorder = new ScenarioRecorder('movement_and_orders');
    recorder.attachListeners(page);

    try {
      // 1. Seed standard starting game state
      await seedScenario('standard_1901', 'proto_1901');

      // 2. Navigate to sandbox view
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_initial_board_loaded');

      // 3. Select French Army in Paris
      const parisArmy = page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]');
      await expect(parisArmy).toBeVisible();
      await parisArmy.click();
      await recorder.recordStep(page, '02_paris_army_selected');

      // 4. In MacroSidebar, scope controls to the Paris army card
      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      await expect(parisCard).toBeVisible();

      const moveTab = parisCard.locator('[data-testid="btn-order-type-MOVE"]');
      await moveTab.click();

      // 5. Select target Burgundy (BUR)
      const targetSelect = parisCard.locator('[data-testid="select-order-target"]');
      if (await targetSelect.isVisible()) {
        await targetSelect.selectOption({ label: 'Burgundy (BUR)' }).catch(async () => {
          await targetSelect.selectOption('BUR');
        });
      } else {
        await page.locator('[data-testid="province-path"][data-province-id="BUR"]').click();
      }

      // 6. Verify SVG order arrow is rendered pointing to BUR
      const orderArrow = page.locator('[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"]');
      await expect(orderArrow).toBeVisible();
      await recorder.recordStep(page, '03_move_arrow_rendered');

      // 7. Switch order to HOLD
      const holdTab = parisCard.locator('[data-testid="btn-order-type-HOLD"]');
      await holdTab.click();
      await expect(orderArrow).toHaveCount(0);
      await recorder.recordStep(page, '04_hold_arrow_cleared');

      // 8. Re-order Move to Burgundy for adjudication verification
      await moveTab.click();
      if (await targetSelect.isVisible()) {
        await targetSelect.selectOption({ label: 'Burgundy (BUR)' }).catch(async () => {
          await targetSelect.selectOption('BUR');
        });
      }
      await expect(orderArrow).toBeVisible();
      await recorder.recordStep(page, '05_move_order_restored');

      // 9. Confirm holds or handle sanity modal so all French units are confirmed
      const confirmAllBtn = page.locator('[data-testid="btn-confirm-all"]');
      if (await confirmAllBtn.isVisible().catch(() => false)) {
        await confirmAllBtn.click();
      }

      const finalizeBtn = page.locator('[data-testid="btn-finalize-orders"]');
      await expect(finalizeBtn).toBeVisible();
      await finalizeBtn.click();

      const sanityModal = page.locator('[data-testid="sanity-check-modal"]');
      try {
        await sanityModal.waitFor({ state: 'visible', timeout: 1500 });
        await page.locator('[data-testid="btn-sanity-force-confirm"]').click();
      } catch {
        // No sanity check modal needed/shown
      }

      // Verify orders are finalized before adjudicating
      const unfinalizeBtn = page.locator('[data-testid="btn-unfinalize-orders"]');
      await expect(unfinalizeBtn).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '06_orders_finalized');

      // 10. Execute adjudication
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.click();

      // Verify phase advances to Fall 1901 Movement
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/FALL 1901/i, { timeout: 10000 });
      await recorder.recordStep(page, '07_fall_1901_adjudicated');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
