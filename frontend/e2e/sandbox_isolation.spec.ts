import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 02: Sandbox War Room Mode & Multi-Power Planning', () => {
  test('enters sandbox from lobby, commands multiple powers, and resolves hypothetical turn', async ({ page }) => {
    const recorder = new ScenarioRecorder('sandbox_isolation');
    recorder.attachListeners(page);

    try {
      // 1. Seed fresh standard board
      await seedScenario('standard_1901', 'proto_1901');

      // 2. Start at Lobby view
      await page.goto('/');
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_lobby_screen');

      // 3. Launch Solo Sandbox
      await page.locator('[data-testid="btn-enter-sandbox"]').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '02_solo_sandbox_board');

      // 4. Switch to England in ToolsSidebar
      const englandCard = page.locator('[data-testid="power-standing-card"][data-power="ENGLAND"]');
      if (await englandCard.isVisible()) {
        await englandCard.click();
        await recorder.recordStep(page, '03_command_switched_to_england');
      }

      // 5. Select England Fleet in London
      const londonFleet = page.locator('[data-testid="unit-token"][data-unit-id="ENG_F_LON"]');
      if (await londonFleet.isVisible()) {
        await londonFleet.click();
        const card = page.locator('[data-testid="unit-macro-card"][data-unit-id="ENG_F_LON"]');
        if (await card.isVisible()) {
          const moveTab = card.locator('[data-testid="btn-order-type-MOVE"]');
          await moveTab.click();
          const targetSelect = card.locator('[data-testid="select-order-target"]');
          if (await targetSelect.isVisible()) {
            await targetSelect.selectOption({ label: 'North Sea (NTH)' }).catch(async () => {
              await targetSelect.selectOption('NTH');
            });
          }
        }
        await recorder.recordStep(page, '04_england_london_ordered_nth');
      }

      // 6. Switch to France and order Army Paris -> Burgundy
      const franceCard = page.locator('[data-testid="power-standing-card"][data-power="FRANCE"]');
      if (await franceCard.isVisible()) {
        await franceCard.click();
        const parisArmy = page.locator('[data-testid="unit-token"][data-unit-id="FRA_A_PAR"]');
        if (await parisArmy.isVisible()) {
          await parisArmy.click();
          const card = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
          if (await card.isVisible()) {
            const moveTab = card.locator('[data-testid="btn-order-type-MOVE"]');
            await moveTab.click();
            const targetSelect = card.locator('[data-testid="select-order-target"]');
            if (await targetSelect.isVisible()) {
              await targetSelect.selectOption({ label: 'Burgundy (BUR)' }).catch(async () => {
                await targetSelect.selectOption('BUR');
              });
            }
          }
        }
        await recorder.recordStep(page, '05_france_paris_ordered_bur');
      }

      // 7. Resolve sandbox phase
      const adjudicateBtn = page.locator('[data-testid="btn-adjudicate-phase"]');
      await expect(adjudicateBtn).toBeVisible();
      await adjudicateBtn.click();

      // Verify turn advanced to Fall 1901
      const turnPill = page.locator('[data-testid="turn-chronicle-pill"]');
      await expect(turnPill).toContainText(/FALL 1901/i, { timeout: 10000 });
      await recorder.recordStep(page, '06_sandbox_hypothetical_resolved');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
