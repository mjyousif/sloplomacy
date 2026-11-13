// @scenario convoy_scenarios
// @order 8
// @description Backend-authoritative convoy reachability: fleet-in-port guard, ocean-blue chained vs solid-green active highlights, dead-end path filtering, Fog of War isolation, broken chains, 4-ship Trans-Med convoy, British Isles unlocking, and bicoastal landing.
import { expect, test } from '@playwright/test';
import {
  DEFAULT_E2E_API_URL,
  postOrder,
  ScenarioRecorder,
  seedScenario,
} from './helpers';

async function spawnUnit(
  power: string,
  unit_type: 'A' | 'F',
  province: string,
  gameId = 'proto_1901',
) {
  const res = await fetch(
    `${DEFAULT_E2E_API_URL}/api/admin/unit/spawn?game_id=${gameId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ power, unit_type, province, user_id: 'guest' }),
    },
  );
  if (!res.ok) {
    throw new Error(`Spawn failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

test.describe('Scenario: Convoy Reachability and Chain Scenarios', () => {
  test('verifies ocean-blue potential convoys, solid-green active chains, path filtering, and Fog of War isolation', async ({
    page,
  }) => {
    const recorder = new ScenarioRecorder('convoy_scenarios');
    recorder.attachListeners(page);

    try {
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      // 1. Fleet in port (F BRE) has no Convoy button
      const fleetBre = page.locator(
        '[data-testid="unit-token"][data-unit-id="FRA_F_BRE"]',
      );
      await fleetBre.click();
      const unitMenu = page.locator('.unit-floating-menu');
      await expect(unitMenu).toBeVisible();
      await expect(unitMenu.getByRole('button', { name: 'Convoy' })).toHaveCount(
        0,
      );
      await recorder.recordStep(page, '01_fleet_in_port_convoy_disabled');
      await page.locator('.floating-close-btn').click();

      // 2. Spawn F ENG, A PIC, and F NTH: check CONVOY_PICK_ARMY & CONVOY_PICK_TARGET
      await spawnUnit('FRANCE', 'F', 'ENG');
      await spawnUnit('FRANCE', 'A', 'PIC');
      await spawnUnit('ENGLAND', 'F', 'NTH');
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      const fleetEng = page.locator(
        '[data-testid="unit-token"][data-unit-id="FRA_F_ENG"]',
      );
      await fleetEng.click();
      await page
        .locator('.unit-floating-menu')
        .getByRole('button', { name: 'Convoy' })
        .click();
      await expect(page.locator('.floating-menu-hint')).toContainText(
        'green = adjacent shore, blue = via fleet chain',
      );
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="PIC"]'),
      ).toHaveAttribute('data-reachable-color', 'green');
      await recorder.recordStep(page, '02_fleet_at_sea_convoy_step1_pick_army');

      // 3. Pick A PIC -> direct Channel coasts are green + reticles, chained North Sea coasts are ocean blue!
      const armyPic = page.locator(
        '[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]',
      );
      await armyPic.click();
      await expect(page.locator('.floating-menu-hint')).toContainText(
        'green = direct / ready, blue = multi-ship chain',
      );
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="WAL"]'),
      ).toHaveAttribute('data-reachable-color', 'green');
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="NWY"]'),
      ).toHaveAttribute('data-reachable-color', 'blue');
      await recorder.recordStep(
        page,
        '03_convoy_step2_pick_target_destinations',
      );
      await page.locator('.floating-close-btn').click();

      // 4. Select A PIC in Move mode: unconfirmed convoy coasts (WAL, LON, NWY) are ocean blue
      await armyPic.click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="WAL"]'),
      ).toHaveAttribute('data-reachable-color', 'blue');
      await recorder.recordStep(
        page,
        '04_army_move_mode_potential_convoy_targets',
      );

      // 5. Order F ENG C A PIC -> WAL: WAL turns solid green with a target reticle!
      await postOrder({
        unit_id: 'FRA_F_ENG',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'ENG',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'WAL',
      });
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]')
        .click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="WAL"]'),
      ).toHaveAttribute('data-reachable-color', 'green');
      await expect(
        page.locator(
          '[data-testid="reachable-reticle"][data-province-id="WAL"]',
        ),
      ).toBeVisible();
      await recorder.recordStep(
        page,
        '05_army_move_mode_active_convoy_chain_to_wales',
      );

      // 6. Multi-ship active convoy chain to Spain (F ENG + F MAO -> SPA is green + reticle)
      //    AND dead-end check: for F MAO -> A PIC, LON/WAL are NOT reachable through MAO!
      await spawnUnit('FRANCE', 'F', 'MAO');
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_F_MAO"]')
        .click();
      await page
        .locator('.unit-floating-menu')
        .getByRole('button', { name: 'Convoy' })
        .click();
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]')
        .click();
      // LON and NWY bypass MAO and must NOT have data-reachable-color!
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="LON"]'),
      ).not.toHaveAttribute('data-reachable-color', /.+/);
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="SPA"]'),
      ).toHaveAttribute('data-reachable-color', 'blue');

      await postOrder({
        unit_id: 'FRA_F_ENG',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'ENG',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'SPA',
      });
      await postOrder({
        unit_id: 'FRA_F_MAO',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'MAO',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'SPA',
      });
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]')
        .click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="SPA"]'),
      ).toHaveAttribute('data-reachable-color', 'green');
      await expect(
        page.locator(
          '[data-testid="reachable-reticle"][data-province-id="SPA"]',
        ),
      ).toBeVisible();
      await recorder.recordStep(
        page,
        '06_multi_ship_active_convoy_chain_to_spain',
      );

      // 7. Clicking bicoastal SPA for A PIC commits MOVE -> Spain [via Convoy] with no fleet coast modal
      await page
        .locator('[data-testid="province-path"][data-province-id="SPA"]')
        .click();
      await expect(page.locator('.coast-choice-modal')).toHaveCount(0);
      await expect(
        page.locator(
          '[data-testid="order-arrow"][data-order-unit="FRA_A_PIC"][data-order-target="SPA"]',
        ),
      ).toBeVisible();
      await recorder.recordStep(
        page,
        '07_army_convoy_bicoastal_landing_direct_no_modal',
      );

      // 8. Broken chain (F ENG + F WES with MAO empty): SPA is unlit
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');
      await spawnUnit('FRANCE', 'A', 'PIC');
      await spawnUnit('FRANCE', 'F', 'ENG');
      await spawnUnit('FRANCE', 'F', 'WES');
      await postOrder({
        unit_id: 'FRA_F_ENG',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'ENG',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'SPA',
      });
      await postOrder({
        unit_id: 'FRA_F_WES',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'WES',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'SPA',
      });
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });
      await page
        .locator('[data-testid="unit-token"][data-unit-id="FRA_A_PIC"]')
        .click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="SPA"]'),
      ).not.toHaveAttribute('data-reachable-color', /.+/);
      await recorder.recordStep(
        page,
        '08_broken_chain_missing_fleet_spain_unlit',
      );

      // 9. 4-Fleet Trans-Mediterranean Grand Convoy (TUR A SYR -> SPA across EAS -> ION -> TYS -> WES)
      await seedScenario('standard_1901', 'proto_1901', 'TURKEY');
      await spawnUnit('TURKEY', 'A', 'SYR');
      for (const sea of ['EAS', 'ION', 'TYS', 'WES']) {
        await spawnUnit('TURKEY', 'F', sea);
        await postOrder({
          unit_id: `TUR_F_${sea}`,
          power: 'TURKEY',
          unit_type: 'F',
          origin: sea,
          order_type: 'CONVOY',
          aux_unit_origin: 'SYR',
          target: 'SPA',
        });
      }
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });
      await page
        .locator('[data-testid="unit-token"][data-unit-id="TUR_A_SYR"]')
        .click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="SPA"]'),
      ).toHaveAttribute('data-reachable-color', 'green');
      await recorder.recordStep(page, '09_trans_med_4_fleet_convoy_spain_green');

      // 10. Mixed-power Fog-of-War & diagnostic isolation in Sandbox:
      //     France orders A PIC -> NWY + F ENG C A PIC -> NWY; England secretly orders F NTH C A PIC -> NWY
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');
      await spawnUnit('FRANCE', 'A', 'PIC');
      await spawnUnit('FRANCE', 'F', 'ENG');
      await spawnUnit('ENGLAND', 'F', 'NTH');
      await postOrder({
        unit_id: 'FRA_A_PIC',
        power: 'FRANCE',
        unit_type: 'A',
        origin: 'PIC',
        order_type: 'MOVE',
        target: 'NWY',
        via_convoy: true,
      });
      await postOrder({
        unit_id: 'FRA_F_ENG',
        power: 'FRANCE',
        unit_type: 'F',
        origin: 'ENG',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'NWY',
      });
      await postOrder({
        unit_id: 'ENG_F_NTH',
        power: 'ENGLAND',
        unit_type: 'F',
        origin: 'NTH',
        order_type: 'CONVOY',
        aux_unit_origin: 'PIC',
        target: 'NWY',
      });
      await page.reload();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      const picCard = page.locator(
        '[data-testid="unit-macro-card"][data-unit-id="FRA_A_PIC"]',
      );
      await expect(picCard).toBeVisible();
      // Picardy card shows ONLY its own 1 info note — never F ENG's note and never England's North Sea note!
      await expect(picCard.locator('.unit-diagnostic-alert')).toHaveCount(1);
      await expect(picCard).not.toContainText('North Sea');
      // Finalize button is green (info notes are not blocking warnings)
      await expect(page.locator('[data-testid="btn-finalize-orders"]')).not.toContainText(
        'Warning',
      );
      await recorder.recordStep(
        page,
        '10_france_view_single_info_no_foreign_bleed',
      );

      // 11. Switch to England: F NTH Convoy Step 1 keeps Picardy in Ocean Blue (via fleet chain), even when A PIC is moving!
      await page
        .locator('[data-testid="power-standing-card"][data-power="ENGLAND"]')
        .click();
      await page
        .locator('[data-testid="unit-token"][data-unit-id="ENG_F_NTH"]')
        .click();
      await page
        .locator('.unit-floating-menu')
        .getByRole('button', { name: 'Convoy' })
        .click();
      await expect(
        page.locator('[data-testid="province-path"][data-province-id="PIC"]'),
      ).toHaveAttribute('data-reachable-color', 'blue');
      await recorder.recordStep(
        page,
        '11_england_nth_convoy_pick_army_picardy_blue',
      );

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
