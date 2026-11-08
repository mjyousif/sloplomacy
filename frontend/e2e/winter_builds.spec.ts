// @scenario builds
// @order 5
// @description Winter adjustments, Army/Fleet builds, bicoastal STP/NC Fleet build, deficit disband, and advance to 1902.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 05: Winter Adjustments, Bicoastal Fleet Builds & Deficit Disbands', () => {
  test('places French Army/Fleet builds, Russian bicoastal STP/NC Fleet build, Austrian deficit disband, and advances to Spring 1902', async ({ page }) => {
    const recorder = new ScenarioRecorder('winter_builds');
    recorder.attachListeners(page);

    try {
      // 1. Seed winter adjustments demo with FRANCE active
      await seedScenario('winter_adjustments_demo', 'proto_1901', 'FRANCE');

      // 2. Load sandbox view
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      // Verify chronicle indicates winter adjustments
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/WINTER 1901.*ADJUSTMENTS/i, { timeout: 10000 });
      await recorder.recordStep(page, '01_winter_adjustments_loaded');

      // 3. Verify build cards in MacroSidebar and place Army in Paris (PAR) and Fleet in Brest (BRE)
      const parBuildCard = page.locator('[data-testid="build-macro-card"][data-home-province="PAR"]');
      const breBuildCard = page.locator('[data-testid="build-macro-card"][data-home-province="BRE"]');
      await expect(parBuildCard).toBeVisible({ timeout: 5000 });
      await expect(breBuildCard).toBeVisible({ timeout: 5000 });

      const parArmyBtn = parBuildCard.locator('[data-testid="btn-build-army"]');
      await expect(parArmyBtn).toBeVisible();
      await parArmyBtn.click();

      const breFleetBtn = breBuildCard.locator('[data-testid="btn-build-fleet"]');
      await expect(breFleetBtn).toBeVisible();
      await breFleetBtn.click();

      // Verify map build tokens are visible for France
      await expect(page.locator('[data-testid="build-token"][data-home-province="PAR"]')).toBeVisible();
      await expect(page.locator('[data-testid="build-token"][data-home-province="BRE"]')).toBeVisible();
      await recorder.recordStep(page, '02_builds_placed_in_par_and_bre');

      // 4. Switch to RUSSIA and place a bicoastal Fleet build on St. Petersburg North Coast (STP/NC)
      const russiaCard = page.locator('[data-testid="power-standing-card"][data-power="RUSSIA"]');
      await expect(russiaCard).toBeVisible();
      await russiaCard.click();

      const stpBuildCard = page.locator('[data-testid="build-macro-card"][data-home-province="STP"]');
      await expect(stpBuildCard).toBeVisible({ timeout: 5000 });
      const stpNorthCoastFleetBtn = stpBuildCard.locator('[data-testid="btn-build-fleet-NC"]');
      await expect(stpNorthCoastFleetBtn).toBeVisible();
      await stpNorthCoastFleetBtn.click();
      await expect(page.locator('[data-testid="build-token"][data-home-province="STP"]')).toBeVisible();
      await recorder.recordStep(page, '03_russia_bicoastal_fleet_stp_nc_placed');

      // 5. Switch to AUSTRIA (2 SCs, 3 units -> -1 deficit) and explicitly order A VIE to DISBAND
      const austriaCard = page.locator('[data-testid="power-standing-card"][data-power="AUSTRIA"]');
      await expect(austriaCard).toBeVisible();
      await austriaCard.click();

      const vieUnitCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="AUS_A_VIE"]');
      await expect(vieUnitCard).toBeVisible();
      const disbandBtn = vieUnitCard.locator('[data-testid="btn-adjustment-disband"]');
      await expect(disbandBtn).toBeVisible();
      await disbandBtn.click();
      await recorder.recordStep(page, '04_austria_deficit_disband_selected');

      // 6. Resolve adjustments
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.click();

      // 7. Verify advance to Spring 1902 Movement, new builds in PAR, BRE, STP, and disband of AUS_A_VIE
      await expect(turnPill).toContainText(/SPRING 1902.*MOVEMENT/i, { timeout: 10000 });
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-power="FRANCE"][data-province="PAR"][data-unit-type="A"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-power="FRANCE"][data-province="BRE"][data-unit-type="F"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-power="RUSSIA"][data-province="STP"][data-unit-type="F"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="unit-token"][data-unit-power="AUSTRIA"][data-province="VIE"]')
      ).toHaveCount(0);
      await recorder.recordStep(page, '05_spring_1902_advanced');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
