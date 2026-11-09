// @scenario history
// @order 7
// @description Turn history: pick a resolved turn in the left pane's footer to see every nation's orders and outcomes, filter by nation, and go back to live.
import { expect, test } from '@playwright/test';
import { playBurgundyBounce, ScenarioRecorder } from './helpers';

test.describe('Scenario 07: Turn history', () => {
  test('shows a past turn with every nation’s orders, read-only, and returns to live', async ({
    page,
  }) => {
    const recorder = new ScenarioRecorder('turn_history');
    recorder.attachListeners(page);

    try {
      // 1. Spring 1901 has resolved with a bounce in Burgundy; France is playing Fall 1901.
      await playBurgundyBounce();
      await page.goto('/?view=sandbox');
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      const selector = page.locator('[data-testid="turn-history"]');
      await expect(selector).toBeVisible();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toHaveValue('live');
      // The nation chips are laid out but off on the live turn.
      // (Playwright reads disabled from the chips, which inherit it from their fieldset.)
      const chips = page.locator(
        '[data-testid="turn-history-power"][data-power="ALL"]',
      );
      await expect(chips).toBeVisible();
      await expect(chips).toBeDisabled();
      // Live: only France's own orders are drawn, and nobody else's.
      await expect(
        page.locator(
          '[data-testid="order-arrow"][data-order-unit="GER_A_MUN"]',
        ),
      ).toHaveCount(0);
      await recorder.recordStep(page, '01_live_turn_with_history_footer');

      // 2. Step back to Spring 1901 with ‹: every nation's orders, coloured by how they resolved.
      // The arrows must not move as the turn changes, so a quick run of clicks on ‹ never
      // lands on something else (the chips row used to pop in and push them up).
      const prev = page.locator('[data-testid="turn-history-prev"]');
      const prevBoxLive = await prev.boundingBox();
      await prev.click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toHaveValue('0');
      await expect(chips).toBeEnabled();
      expect(await prev.boundingBox()).toEqual(prevBoxLive);
      const germanMove = page.locator(
        '[data-testid="order-arrow"][data-order-unit="GER_A_MUN"][data-order-target="BUR"]',
      );
      const englishMove = page.locator(
        '[data-testid="order-arrow"][data-order-unit="ENG_F_LON"][data-order-target="NTH"]',
      );
      await expect(germanMove).toBeVisible();
      await expect(germanMove).toContainText('BOUNCED');
      await expect(englishMove).toBeVisible();
      await expect(englishMove).not.toContainText('BOUNCED');
      // The board is the one the turn began with: Paris has not moved yet.
      await expect(
        page.locator(
          '[data-testid="unit-token"][data-unit-id="FRA_A_PAR"][data-province="PAR"]',
        ),
      ).toBeVisible();

      // The orders panel is read-only under a bar back to live.
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toContainText('Spring 1901 Movement');
      await expect(
        page.locator('[data-testid="macro-sidebar"] .macro-units-scroll-area'),
      ).toHaveAttribute('inert', '');
      await recorder.recordStep(page, '02_spring_1901_all_nations');

      // 3. A nation chip shows only that nation's orders.
      await page
        .locator('[data-testid="turn-history-power"][data-power="GERMANY"]')
        .click();
      await expect(germanMove).toBeVisible();
      await expect(englishMove).toHaveCount(0);
      await recorder.recordStep(page, '03_germany_only');

      // 4. Back to live from the orders panel's bar.
      await page.locator('[data-testid="history-lock-live-btn"]').click();
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toHaveValue('live');
      await expect(germanMove).toHaveCount(0);
      await expect(chips).toBeDisabled();
      expect(await prev.boundingBox()).toEqual(prevBoxLive);
      await recorder.recordStep(page, '04_back_to_live');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
