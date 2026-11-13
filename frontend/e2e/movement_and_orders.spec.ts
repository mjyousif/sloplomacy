// @scenario movement
// @order 1
// @description Map reticle Move, Support vector, Hold toggle, Sea-Fleet Convoy guard (#142), adjudication, and Admin Console turn rollback.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

async function spawnUnit(
  power: string,
  unit_type: 'A' | 'F',
  province: string,
  gameId = 'proto_1901',
) {
  const res = await fetch(
    `http://localhost:8000/api/admin/unit/spawn?game_id=${gameId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ power, unit_type, province }),
    },
  );
  if (!res.ok) {
    throw new Error(`Spawn failed (${res.status}): ${await res.text()}`);
  }
}

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

      // 9. Open Turn and Clock Settings from the Administrator menu and revert to Spring 1901 Movement
      await page.locator('[data-testid="btn-admin-menu"]').click();
      const openAdminBtn = page.locator('[data-testid="btn-open-admin-console"]');
      await expect(openAdminBtn).toBeVisible();
      await openAdminBtn.click();

      const adminPanel = page.locator('[data-testid="admin-tools-modal"]');
      await expect(adminPanel).toBeVisible();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toBeDisabled();

      const rollbackBtn = adminPanel.locator('[data-testid="btn-admin-rollback"]');
      await expect(rollbackBtn).toBeEnabled({ timeout: 5000 });
      await rollbackBtn.click({ modifiers: ['Shift'] });

      await expect(turnPill).toContainText(/SPRING 1901/i, { timeout: 10000 });
      await page.locator('[data-testid="btn-admin-menu"]').click();
      await page.locator('[data-testid="btn-exit-admin-mode"]').click();
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"][data-province="PAR"]')
      ).toBeVisible();
      await recorder.recordStep(page, '08_turn_rolled_back_to_spring_1901');

      // 10. Verify Fleet at sea Convoy flow disallows water/inland tiles (#142) and convoys coastal army to coast
      await spawnUnit('FRANCE', 'F', 'ENG');
      await spawnUnit('FRANCE', 'A', 'PIC');
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"][data-unit-id="FRA_F_ENG"]', {
        timeout: 15000,
      });
      const adminWarningModal = page.locator('[data-testid="admin-action-warning-modal"]');
      if (await adminWarningModal.isVisible()) {
        await page.locator('[data-testid="admin-warning-acknowledge-btn"]').click();
        await expect(adminWarningModal).toHaveCount(0);
      }

      const fleetEng = page.locator('[data-testid="unit-token"][data-unit-id="FRA_F_ENG"]');
      const armyPic = page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]');
      const maoWaterPath = page.locator('[data-testid="province-path"][data-province-id="MAO"]');
      const nthWaterPath = page.locator('[data-testid="province-path"][data-province-id="NTH"]');

      await fleetEng.click();
      await page.locator('.unit-floating-menu').getByRole('button', { name: 'Convoy' }).click();
      // Sea zones must NOT stay lit green once Convoy mode is entered (#142)
      await expect(maoWaterPath).not.toHaveAttribute('fill', '#4ade80');
      await expect(nthWaterPath).not.toHaveAttribute('fill', '#4ade80');

      await armyPic.click();
      await expect(maoWaterPath).not.toHaveAttribute('fill', '#4ade80');
      await expect(nthWaterPath).not.toHaveAttribute('fill', '#4ade80');
      await recorder.recordStep(page, '09_convoy_pick_target_water_tiles_unlit');

      // Clicking a water tile in CONVOY_PICK_TARGET must be ignored (no CONVOY order created)
      await nthWaterPath.click();
      await expect(
        page.locator('[data-testid="order-arrow"][data-order-unit="FRA_F_ENG"][data-order-type="CONVOY"]')
      ).toHaveCount(0);

      // Re-pick Convoy -> A PIC -> coastal WAL and verify valid CONVOY vector renders.
      // Since #193 a convoy target carries a reticle, which covers the middle of Wales, so the
      // pick goes through the reticle as a player's click would.
      await fleetEng.click();
      await page.locator('.unit-floating-menu').getByRole('button', { name: 'Convoy' }).click();
      await armyPic.click();
      await page.locator('[data-testid="reachable-reticle"][data-province-id="WAL"]').click();
      await expect(
        page.locator(
          '[data-testid="order-arrow"][data-order-unit="FRA_F_ENG"][data-order-type="CONVOY"][data-order-target="WAL"]'
        )
      ).toBeVisible();
      await recorder.recordStep(page, '10_convoy_order_to_coast_rendered');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
