// @scenario game_over
// @description Game Over modal triggered by 18+ supply centers, final board inspection, and re-opening from the top-bar winner pill.
import { expect, test } from '@playwright/test';
import {
  DEFAULT_E2E_API_URL,
  ScenarioRecorder,
  seedScenario,
} from './helpers';

test.describe('Scenario: Game Over Modal & Final Board Inspection', () => {
  test('opens GameOverModal on victory, inspects final board, and re-opens via winner pill', async ({
    page,
  }) => {
    const recorder = new ScenarioRecorder('game_over');
    recorder.attachListeners(page);

    try {
      // 1. Seed standard 1901 on proto_1901, advance to Fall 1907 Movement, and place France 1 SC from solo
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');

      const setTurnResp = await fetch(
        `${DEFAULT_E2E_API_URL}/api/admin/set-turn?game_id=proto_1901`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            season: 'Fall',
            year: 1907,
            phase: 'Movement',
          }),
        },
      );
      expect(setTurnResp.ok).toBe(true);
      const state = await setTurnResp.json();

      const gameResp = await fetch(
        `${DEFAULT_E2E_API_URL}/api/game?game_id=proto_1901`,
      );
      expect(gameResp.ok).toBe(true);
      const bootstrap = await gameResp.json();
      const provinces = bootstrap.provinces as Record<
        string,
        { is_supply_center: boolean }
      >;

      const scIds = Object.keys(provinces)
        .filter(
          (id) =>
            provinces[id]?.is_supply_center && id !== 'TUN' && id !== 'PAR',
        )
        .sort()
        .slice(0, 16);
      const updatedOwnership: Record<string, string> = { PAR: 'FRANCE' };
      for (const sc of scIds) {
        updatedOwnership[sc] = 'FRANCE';
      }

      const editResp = await fetch(
        `${DEFAULT_E2E_API_URL}/api/admin/board-edit?game_id=proto_1901`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_revision: state.state_revision,
            expected_season: state.season,
            expected_year: state.year,
            expected_phase: state.phase,
            units: [
              {
                id: 'FRA_F_ION',
                power: 'FRANCE',
                unit_type: 'F',
                province: 'ION',
              },
              {
                id: 'FRA_A_PAR',
                power: 'FRANCE',
                unit_type: 'A',
                province: 'PAR',
              },
              {
                id: 'TUR_A_SMY',
                power: 'TURKEY',
                unit_type: 'A',
                province: 'SMY',
              },
            ],
            ownership: updatedOwnership,
            orders: {
              FRA_F_ION: {
                unit_id: 'FRA_F_ION',
                power: 'FRANCE',
                unit_type: 'F',
                origin: 'ION',
                order_type: 'MOVE',
                target: 'TUN',
                is_explicit: true,
              },
            },
          }),
        },
      );
      expect(editResp.ok).toBe(true);

      // 2. Load sandbox view, acknowledge admin notice, and resolve Fall 1907 to capture the 18th SC
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      const ackBtn = page.locator(
        '[data-testid="admin-warning-acknowledge-btn"]',
      );
      if (await ackBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ackBtn.click();
      }

      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.dblclick();

      // 3. GameOverModal appears automatically
      const modal = page.locator('[data-testid="game-over-modal"]');
      await expect(modal).toBeVisible({ timeout: 10000 });
      await expect(modal).toContainText('France Claims Continental Hegemony');
      await recorder.recordStep(page, '01_game_over_modal_open');

      // 4. Click "Inspect Final Board" to close modal and inspect read-only board
      const inspectBtn = page.locator('[data-testid="game-over-inspect-btn"]');
      await inspectBtn.click();
      await expect(modal).toHaveCount(0);

      const winnerPill = page.locator('.game-over-pill');
      await expect(winnerPill).toBeVisible();
      await expect(winnerPill).toContainText('FRANCE WINS');
      await recorder.recordStep(page, '02_inspect_final_board');

      // 5. Re-open modal from top-bar winner pill
      await winnerPill.click();
      await expect(modal).toBeVisible({ timeout: 5000 });
      await recorder.recordStep(page, '03_reopened_from_pill');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
