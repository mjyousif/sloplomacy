// @scenario sandbox
// @order 2
// @description Lobby launch, Hypothetical Mode foreign pre-move isolation, and order retention check.
import { test, expect } from '@playwright/test';
import { ScenarioRecorder, seedScenario } from './helpers';

test.describe('Scenario 02: Sandbox War Room Mode & Foreign Pre-Move Isolation', () => {
  test('enters hypothetical mode, plots foreign moves, exits to discard foreign guesses while keeping own orders', async ({ page }) => {
    const recorder = new ScenarioRecorder('sandbox_isolation');
    recorder.attachListeners(page);

    try {
      // 1. Seed fresh standard board with FRANCE active
      await seedScenario('standard_1901', 'proto_1901', 'FRANCE');

      // 2. Start at Lobby view
      await page.goto('/');
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await recorder.recordStep(page, '01_lobby_screen');

      // 3. Launch Solo Sandbox
      await page.locator('[data-testid="btn-enter-sandbox"]').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await recorder.recordStep(page, '02_solo_sandbox_board');

      // 4. Enter Hypothetical Mode via ToolsSidebar toggle
      const toggleSandboxBtn = page.locator('[data-testid="btn-toggle-sandbox"]');
      await expect(toggleSandboxBtn).toBeVisible();
      await expect(toggleSandboxBtn).toContainText(/Enter Hypothetical Mode/i);
      await toggleSandboxBtn.click();
      await expect(toggleSandboxBtn).toContainText(/Exit Mode/i);
      await recorder.recordStep(page, '03_hypothetical_mode_entered');

      // 5. Order active power (FRANCE) Army in Paris -> Burgundy (BUR)
      const parisCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="FRA_A_PAR"]');
      await expect(parisCard).toBeVisible();
      await parisCard.locator('[data-testid="btn-order-type-MOVE"]').click();
      const parisSelect = parisCard.locator('[data-testid="select-order-target"]');
      await expect(parisSelect).toBeVisible();
      await parisSelect.selectOption('BUR');

      const parisArrow = page.locator(
        '[data-testid="order-arrow"][data-order-unit="FRA_A_PAR"][data-order-target="BUR"]'
      );
      await expect(parisArrow).toBeVisible();
      await recorder.recordStep(page, '04_france_paris_ordered_bur');

      // 6. Switch to foreign power (ENGLAND) in ToolsSidebar and plot hypothetical move F LON -> NTH
      const englandCard = page.locator('[data-testid="power-standing-card"][data-power="ENGLAND"]');
      await expect(englandCard).toBeVisible();
      await englandCard.click();

      const londonCard = page.locator('[data-testid="unit-macro-card"][data-unit-id="ENG_F_LON"]');
      await expect(londonCard).toBeVisible();
      await londonCard.locator('[data-testid="btn-order-type-MOVE"]').click();
      const londonSelect = londonCard.locator('[data-testid="select-order-target"]');
      await expect(londonSelect).toBeVisible();
      await londonSelect.selectOption('NTH');

      const londonArrow = page.locator(
        '[data-testid="order-arrow"][data-order-unit="ENG_F_LON"][data-order-target="NTH"]'
      );
      await expect(londonArrow).toBeVisible();
      await recorder.recordStep(page, '05_england_hypothetical_move_plotted');

      // 7. Switch back to FRANCE before exiting Hypothetical Mode so FRANCE is the retained active power
      const franceCard = page.locator('[data-testid="power-standing-card"][data-power="FRANCE"]');
      await expect(franceCard).toBeVisible();
      await franceCard.click();

      // 8. Exit Hypothetical Mode and verify foreign guesses (ENG_F_LON -> NTH) are discarded while own move (FRA_A_PAR -> BUR) remains
      await toggleSandboxBtn.click();
      await expect(toggleSandboxBtn).toContainText(/Enter Hypothetical Mode/i);
      await expect(londonArrow).toHaveCount(0);
      await expect(parisArrow).toBeVisible();
      await recorder.recordStep(page, '06_hypothetical_exited_foreign_discarded');

      // 9. Attempt to save sandbox as guest -> opens AuthModal prompt
      const saveSandboxBtn = page.locator('[data-testid="btn-save-sandbox"]');
      await expect(saveSandboxBtn).toBeVisible();
      await saveSandboxBtn.click();

      const authModal = page.getByRole('dialog', { name: 'Diplomatic Credentials' });
      await expect(authModal).toBeVisible();
      await recorder.recordStep(page, '07_auth_modal_prompt_on_save');

      // 10. Authenticate via dev credentials
      await page.fill('#auth-email', 'tactician@slop.eu');
      await page.fill('#auth-password', 'password123');
      await page.getByRole('button', { name: 'Sign In to Chancellery' }).click();
      await expect(authModal).toHaveCount(0);

      // 11. Click Save Sandbox again as authenticated user -> opens SaveSandboxModal
      await saveSandboxBtn.click();
      const saveModal = page.locator('[data-testid="save-sandbox-modal"]');
      await expect(saveModal).toBeVisible();
      await recorder.recordStep(page, '08_save_sandbox_modal_opened');

      // 12. Enter custom sandbox name and submit
      const nameInput = page.locator('[data-testid="input-sandbox-name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Operation Charlemagne');
      await recorder.recordStep(page, '09_custom_sandbox_name_entered');

      const submitSaveBtn = page.locator('[data-testid="btn-confirm-save-sandbox"]');
      await submitSaveBtn.click();
      await expect(saveModal).toHaveCount(0);
      await recorder.recordStep(page, '10_sandbox_promoted_and_saved');

      recorder.finalize('PASSED');
    } catch (err) {
      recorder.finalize('FAILED');
      throw err;
    }
  });
});
