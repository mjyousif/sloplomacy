// @scenario movement
// @order 1
// @description Map reticle Move, Support vector, Hold toggle, adjudication, and Admin Console turn rollback.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 01: Tactical Movement, Map Clicks, Support & Admin Rollback', () => {
  test('selects unit, orders move via map reticle, plots support vector, adjudicates, and rolls back turn via Admin Console', async ({ page }) => {
    const recorder = new ScenarioRecorder('movement_and_orders');
    recorder.attachListeners(page);

    try {
      // 1. Seed standard starting game state with FRANCE active
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');

      // 2. Navigate to sandbox view
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_initial_board_loaded');

      // 3. Select French Army in Paris on the map and click Burgundy's reachable reticle directly on the map
      const parisArmy = page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]');
      await expect(parisArmy).toBeVisible();
      await parisArmy.click();
      await recorder.recordStep(page, '02_paris_army_selected');

      const burReticle = page.locator('[data-testid="reachable-reticle"][data-province-id="BUR"]');
      await expect(burReticle).toBeVisible();
      await burReticle.click();

      // 4. Verify SVG move arrow is rendered pointing to BUR
      const orderArrow = page.locator(
        '[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"][data-order-type="MOVE"][data-order-target="BUR"]'
      );
      await expect(orderArrow).toBeVisible();
      await recorder.recordStep(page, '03_move_arrow_rendered_from_map_reticle');

      // 5. In MacroSidebar, toggle FRA_A_PAR to HOLD and back to MOVE -> BUR
      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      await expect(parisCard).toBeVisible();

      const holdTab = parisCard.locator('[data-testid="btn-order-type-HOLD"]');
      await expect(holdTab).toBeVisible();
      await holdTab.click();
      await expect(orderArrow).toHaveCount(0);
      await recorder.recordStep(page, '04_hold_arrow_cleared');

      const moveTab = parisCard.locator('[data-testid="btn-order-type-MOVE"]');
      await moveTab.click();
      const targetSelect = parisCard.locator('[data-testid="select-order-target"]');
      await expect(targetSelect).toBeVisible();
      await targetSelect.selectOption('BUR');
      await expect(orderArrow).toBeVisible();

      // 6. Order French Army in Marseilles (FRA_A_MAR) to SUPPORT A PAR -> BUR and verify SUPPORT arrow
      const marCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_MAR"]');
      await expect(marCard).toBeVisible();
      await marCard.locator('[data-testid="btn-order-type-SUPPORT"]').click();
      const supportUnitSelect = marCard.locator('[data-testid="select-support-unit"]');
      await expect(supportUnitSelect).toBeVisible();
      await supportUnitSelect.selectOption('PAR');
      const supportTargetSelect = marCard.locator('[data-testid="select-support-target"]');
      await expect(supportTargetSelect).toBeVisible();
      await supportTargetSelect.selectOption('BUR');

      const supportArrow = page.locator(
        '[data-testid="order-arrow"][data-order-unit="FRA_A_MAR"][data-order-type="SUPPORT"][data-order-target="BUR"]'
      );
      await expect(supportArrow).toBeVisible();
      await recorder.recordStep(page, '05_move_and_support_vectors_rendered');

      // 7. Confirm all French orders and finalize
      const confirmAllBtn = page.locator('[data-testid="btn-confirm-all"]');
      await expect(confirmAllBtn).toBeVisible();
      await confirmAllBtn.click();

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

      // 8. Execute adjudication
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      // A double-click resolves one phase, not two (it once skipped Fall 1901 entirely).
      await adjudicateBtn.dblclick();

      // Verify phase advances to Fall 1901 Movement and FRA_A_PAR moved to BUR
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/FALL 1901/i, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await expect(turnPill).toContainText(/FALL 1901/i);
      const advancedArmy = page.locator(
        '[data-testid="unit-token"][data-unit-id="FRA_A_PAR"][data-province="BUR"]'
      );
      await expect(advancedArmy).toBeVisible();
      await recorder.recordStep(page, '07_fall_1901_adjudicated');

      // 9. Open Admin Console and roll back to Spring 1901 Movement
      const openAdminBtn = page.locator('[data-testid="btn-open-admin-console"]');
      await expect(openAdminBtn).toBeVisible();
      await openAdminBtn.click();

      const adminModal = page.locator('[data-testid="admin-tools-modal"]');
      await expect(adminModal).toBeVisible();

      const rollbackBtn = adminModal.locator('[data-testid="btn-admin-rollback"]');
      await expect(rollbackBtn).toBeEnabled({ timeout: 5000 });
      await rollbackBtn.click({ modifiers: ['Shift'] });

      await expect(turnPill).toContainText(/SPRING 1901/i, { timeout: 10000 });
      await adminModal.locator('[data-testid="btn-admin-close"]').click();
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"][data-province="PAR"]')
      ).toBeVisible();
      await recorder.recordStep(page, '08_turn_rolled_back_to_spring_1901');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
