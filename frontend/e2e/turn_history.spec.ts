// @scenario history
// @order 7
// @description Turn history: step through or pick a resolved turn from the unified top-bar turn chronicle, hover to expand nation filters, and go back to live.
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
        page.locator('[data-testid="turn-history-live"]'),
      ).toHaveCount(0);
      // The unified control sits in the top bar and keeps the left sidebar clear of a history footer.
      await expect(
        page.locator('.tools-sidebar [data-testid="turn-history"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Fall 1901 Movement');
      // Hovering must not open the tray; only clicking the filter button opens it.
      const filterToggle = page.locator(
        '[data-testid="turn-history-filter-toggle"]',
      );
      await selector.hover();
      await expect(page.locator('[data-testid="turn-history-tray"]')).toBeHidden();

      // Clicking the filter button expands the country filters, disabled on the live turn.
      await filterToggle.click();
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
      await recorder.recordStep(page, '01_live_turn_with_history_hover');
      await page.mouse.click(10, 300);
      await expect(page.locator('[data-testid="turn-history-tray"]')).toBeHidden();

      // 2. Step back to Spring 1901 with ‹: every nation's orders, coloured by how they resolved.
      // Neither the outer box width nor the ‹ arrow may move as the turn or filter changes.
      const pill = page.locator('[data-testid="turn-chronicle-pill"]');
      const pillBoxLive = await pill.boundingBox();
      const prev = page.locator('[data-testid="turn-history-prev"]');
      const prevBoxLive = await prev.boundingBox();
      await prev.click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Spring 1901 Movement');
      await expect(chips).toBeEnabled();
      expect(await prev.boundingBox()).toEqual(prevBoxLive);
      expect(await pill.boundingBox()).toEqual(pillBoxLive);
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

      // The yellow icon-only back-to-live button appears when viewing a past turn without shifting the chronicle.
      const backToLiveTopBtn = page.locator('[data-testid="turn-history-live"]');
      await expect(backToLiveTopBtn).toBeVisible();
      await expect(backToLiveTopBtn).toHaveText('');

      // The orders panel is read-only under a bar back to live.
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toContainText('Spring 1901 Movement');
      await expect(
        page.locator('[data-testid="macro-sidebar"] .macro-units-scroll-area'),
      ).toHaveAttribute('inert', '');
      await recorder.recordStep(page, '02_spring_1901_all_nations');

      // 3. Click the filter button and pick a nation chip to show only that nation's orders, then click outside to collapse.
      await filterToggle.click();
      await page
        .locator('[data-testid="turn-history-power"][data-power="GERMANY"]')
        .click();
      await expect(germanMove).toBeVisible();
      await expect(englishMove).toHaveCount(0);
      await page.mouse.click(10, 300);
      await expect(page.locator('[data-testid="turn-history-tray"]')).toBeHidden();
      await expect(filterToggle).toContainText('GER');
      await expect(filterToggle).toHaveClass(/has-filter/);
      expect(await pill.boundingBox()).toEqual(pillBoxLive);
      await recorder.recordStep(page, '03_germany_only');

      // 4. Entering admin mode (Edit Board) puts the chronicle back to the latest turn and locks the dropdown.
      await page.locator('[data-testid="btn-admin-menu"]').click();
      await page.locator('[data-testid="btn-toggle-direct-edit"]').click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Fall 1901 Movement');
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toBeDisabled();
      await expect(prev).toBeDisabled();
      await expect(filterToggle).toBeDisabled();
      await expect(backToLiveTopBtn).toHaveCount(0);

      // Exit admin mode: turn history unlocks again, still on live.
      await page.locator('[data-testid="btn-admin-menu"]').click();
      await page.locator('[data-testid="btn-exit-admin-mode"]').click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toBeEnabled();
      await expect(prev).toBeEnabled();
      await expect(filterToggle).toBeEnabled();

      // Step back once more and verify the top bar's yellow back-to-live button returns to live.
      await prev.click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Spring 1901 Movement');
      await backToLiveTopBtn.click();
      await expect(backToLiveTopBtn).toHaveCount(0);
      await expect(
        page.locator('[data-testid="history-lock-bar"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Fall 1901 Movement');
      await expect(germanMove).toHaveCount(0);
      await expect(chips).toBeDisabled();
      expect(await prev.boundingBox()).toEqual(prevBoxLive);
      expect(await pill.boundingBox()).toEqual(pillBoxLive);
      await recorder.recordStep(page, '04_back_to_live');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
