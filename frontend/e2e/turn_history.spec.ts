// @scenario history
// @order 7
// @description Turn history: step through or pick a resolved turn from the unified top-bar turn chronicle, filter by nations right under Viewing [turn] in the right sidebar, and go back to live.
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
        page.locator(
          '[data-testid="tools-sidebar"] [data-testid="turn-history"]',
        ),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toContainText('Fall 1901 Movement');
      // No nation filter control sits in the top bar.
      await expect(
        page.locator('[data-testid="turn-history-filter-toggle"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="turn-history-tray"]'),
      ).toHaveCount(0);
      // Live: only France's own orders are drawn, and nobody else's.
      await expect(
        page.locator(
          '[data-testid="order-arrow"][data-order-unit="GER_A_MUN"]',
        ),
      ).toHaveCount(0);
      await recorder.recordStep(page, '01_live_turn_with_history_hover');

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
      const backToLiveTopBtn = page.locator(
        '[data-testid="turn-history-live"]',
      );
      await expect(backToLiveTopBtn).toBeVisible();
      await expect(backToLiveTopBtn).toHaveText('');

      // The right sidebar replaces live controls with the resolved past turn's header, Nations/Action filters, and movement log.
      const historyLockBar = page.locator('[data-testid="history-lock-bar"]');
      await expect(historyLockBar).toContainText('Spring 1901 Movement');
      await expect(
        historyLockBar.locator('[data-testid="history-lock-live-btn"]'),
      ).toHaveCount(0);
      await expect(
        historyLockBar.locator('[data-testid="history-lock-filter-header"]'),
      ).toHaveText('Filters');
      await expect(
        page.locator('[data-testid="history-lock-filter-note"]'),
      ).toHaveCount(0);
      await expect(
        historyLockBar.locator('[data-testid="turn-history-power"]'),
      ).toHaveCount(7);
      await expect(
        historyLockBar.locator('[data-testid="turn-history-action"]'),
      ).toHaveCount(4);
      await expect(
        historyLockBar.locator('[data-testid="turn-history-clear-powers"]'),
      ).toBeDisabled();
      await expect(
        historyLockBar.locator('[data-testid="turn-history-clear-actions"]'),
      ).toBeDisabled();
      await expect(
        page.locator('[data-testid="btn-toggle-compact-orders"]'),
      ).toHaveCount(0);
      const historyList = page.locator('[data-testid="history-orders-list"]');
      await expect(historyList).toBeVisible();
      await expect(
        page.locator('[data-testid="btn-finalize-orders"]'),
      ).toHaveCount(0);
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="GERMANY"]',
        ),
      ).toBeVisible();
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="ENGLAND"]',
        ),
      ).toBeVisible();
      await recorder.recordStep(page, '02_spring_1901_all_nations');

      // Nation cards on the left scoreboard are neither hoverable nor clickable while viewing a past turn.
      const leftGerCard = page.locator(
        '[data-testid="tools-sidebar"] [data-testid="power-standing-card"][data-power="GERMANY"]',
      );
      await expect(leftGerCard).not.toHaveAttribute('data-clickable', 'true');
      await leftGerCard.click();
      await expect(leftGerCard).not.toHaveAttribute('data-selected', 'true');

      // 3. Pick Germany from the nation filter bar directly under Viewing: both map arrows and sidebar log narrow to Germany.
      const gerChip = historyLockBar.locator(
        '[data-testid="turn-history-power"][data-power="GERMANY"]',
      );
      const engChip = historyLockBar.locator(
        '[data-testid="turn-history-power"][data-power="ENGLAND"]',
      );
      await gerChip.click();
      await expect(gerChip).toHaveAttribute('data-active', 'true');
      await expect(germanMove).toBeVisible();
      await expect(englishMove).toHaveCount(0);
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="GERMANY"]',
        ),
      ).toBeVisible();
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="ENGLAND"]',
        ),
      ).toHaveCount(0);

      // Select England too (multi-nation filter): both Germany and England appear on the map and sidebar.
      await engChip.click();
      await expect(engChip).toHaveAttribute('data-active', 'true');
      await expect(germanMove).toBeVisible();
      await expect(englishMove).toBeVisible();
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="ENGLAND"]',
        ),
      ).toBeVisible();
      await expect(
        historyList.locator(
          '[data-testid="history-power-group"][data-power="FRANCE"]',
        ),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="history-lock-filter-note"]'),
      ).toHaveCount(0);
      expect(await pill.boundingBox()).toEqual(pillBoxLive);

      // Clicking a sidebar order pins its highlight on the map and dims unrelated orders.
      const gerMunichRow = historyList.locator(
        '[data-testid="history-order-item"][data-order-id="GER_A_MUN"]',
      );
      await expect(
        gerMunichRow.locator('[data-testid="history-order-unit-icon"]'),
      ).toBeVisible();
      await gerMunichRow.click();
      await expect(gerMunichRow).toHaveAttribute('data-selected', 'true');
      await expect(germanMove).toHaveAttribute('opacity', '1');
      await expect(englishMove).toHaveAttribute('opacity', '0.22');
      await recorder.recordStep(page, '03_filtered_nations');

      // Filtering by Actions ("Hold") narrows both the map arrows and the sidebar log, and X clears the row.
      const holdChip = historyLockBar.locator(
        '[data-testid="turn-history-action"][data-action="HOLD"]',
      );
      const clearActionsBtn = historyLockBar.locator(
        '[data-testid="turn-history-clear-actions"]',
      );
      await holdChip.click();
      await expect(holdChip).toHaveAttribute('data-active', 'true');
      await expect(clearActionsBtn).toBeEnabled();
      await expect(germanMove).toHaveCount(0);
      await expect(
        historyList.locator(
          '[data-testid="history-order-item"][data-order-id="GER_A_BER"]',
        ),
      ).toBeVisible();
      await expect(gerMunichRow).toHaveCount(0);
      await recorder.recordStep(page, '03b_filtered_hold_action');
      await clearActionsBtn.click();
      await expect(clearActionsBtn).toBeDisabled();
      await expect(germanMove).toBeVisible();

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
      await expect(backToLiveTopBtn).toHaveCount(0);

      // Exit admin mode: turn history unlocks again, still on live.
      await page.locator('[data-testid="btn-admin-menu"]').click();
      await page.locator('[data-testid="btn-exit-admin-mode"]').click();
      await expect(
        page.locator('[data-testid="turn-history-select"]'),
      ).toBeEnabled();
      await expect(prev).toBeEnabled();

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
      await expect(leftGerCard).toHaveAttribute('data-clickable', 'true');
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
