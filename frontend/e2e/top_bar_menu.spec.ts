// @scenario top_bar_menu
// @description Top-bar Game Settings (Solo Sandbox, Administrator) and Account menu (profile, Display Settings, Switch Game, Sign Out).
import { expect, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

const USER = {
  id: `local_topbar_${Date.now().toString(36)}`,
  email: 'talleyrand@diplomacy.test',
  displayName: 'Talleyrand',
  fullName: 'Charles-Maurice de Talleyrand',
  isLocalDemo: true,
  needsUsernameSetup: false,
};

function demoHeaders(): Record<string, string> {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: USER.id, email: USER.email })}.`;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

test.describe('Unified Top Bar Dropdowns', () => {
  test('shows Game Settings (Solo Sandbox + Administrator) and Account menu (profile, Display Settings, Switch Game, Sign Out)', async ({
    page,
    context,
  }) => {
    const rec = new ScenarioRecorder('top_bar_menu');
    rec.attachListeners(page);

    try {
      const matchName = `Vienna Congress ${Date.now().toString(36)}`;
      const res = await fetch(`${DEFAULT_E2E_API_URL}/api/games`, {
        method: 'POST',
        headers: demoHeaders(),
        body: JSON.stringify({
          name: matchName,
          creator_power: 'FRANCE',
          user_id: USER.id,
          email: USER.email,
          display_name: USER.displayName,
        }),
      });
      expect(res.ok).toBe(true);
      const created = await res.json();

      await context.addInitScript((stored) => {
        localStorage.setItem(
          'diplomacy_1901_local_auth_user',
          JSON.stringify(stored),
        );
      }, USER);

      await page.goto('/');
      await page.getByTestId('hero-enter-btn').click();
      await page.waitForSelector('[data-testid="unit-token"]', {
        timeout: 15000,
      });

      const gameTrigger = page.getByTestId('game-settings-trigger');
      const trigger = page.getByTestId('account-menu-trigger');
      await expect(gameTrigger).toBeVisible();
      await expect(gameTrigger).toHaveText('');
      await expect(gameTrigger).toHaveAttribute('data-icon', 'crown');
      await expect(gameTrigger).toHaveAttribute('data-solo-sandbox', 'false');
      await expect(trigger).toHaveText('');
      await expect(trigger).toHaveAttribute('data-signed-in', 'true');
      await expect(page.getByTestId('sandbox-mode-indicator')).toHaveCount(0);
      await expect(page.getByTestId('nav-match-pill')).toHaveCount(0);
      await expect(page.getByTestId('btn-surrender-sidebar')).toHaveCount(0);

      // Game Settings in a multiplayer match shows France flag beside match name and offers Surrender
      await gameTrigger.click();
      const subtitle = page.getByTestId('game-settings-subtitle');
      await expect(subtitle).toContainText(matchName);
      await expect(subtitle.getByTestId('power-flag-france')).toBeVisible();
      await expect(page.getByTestId('game-settings-surrender')).toBeVisible();
      await gameTrigger.click();

      // Account menu: profile header (no pencil), Display Settings, Account Settings, Switch Game, Sign Out
      await trigger.click();

      const panel = page.getByTestId('account-menu-panel');
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('account-menu-name')).toHaveText(
        USER.fullName,
      );
      await expect(page.getByTestId('account-menu-username')).toHaveText(
        `@${USER.displayName}`,
      );
      await expect(page.getByTestId('account-menu-edit-username')).toHaveCount(
        0,
      );
      await expect(page.getByTestId('account-menu-email')).toHaveText(
        USER.email,
      );
      await expect(
        page.getByTestId('account-menu-account-settings'),
      ).toBeVisible();
      await expect(page.getByTestId('account-menu-admin-settings')).toHaveCount(
        0,
      );

      // Verify profile text is larger than the menu items below it.
      const sizes = await page.evaluate(() => {
        const px = (id: string) =>
          Number.parseFloat(
            getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!)
              .fontSize,
          );
        return {
          name: px('account-menu-name'),
          username: px('account-menu-username'),
          email: px('account-menu-email'),
          displayItem: px('account-menu-display-settings'),
          changeGameItem: px('account-menu-change-game'),
          signOutItem: px('account-menu-signout'),
        };
      });
      expect(sizes.name).toBeGreaterThan(sizes.displayItem);
      expect(sizes.username).toBeGreaterThan(sizes.displayItem);
      expect(sizes.email).toBeGreaterThan(sizes.displayItem);
      expect(sizes.email).toBeGreaterThan(sizes.changeGameItem);
      expect(sizes.email).toBeGreaterThan(sizes.signOutItem);

      await rec.recordStep(page, '01_dropdown_main_profile');

      // Display Settings subview (Spacing at top: Compact / Normal)
      await page.getByTestId('account-menu-display-settings').click();
      await expect(
        panel.getByRole('heading', { name: 'Display settings' }),
      ).toBeVisible();
      await expect(panel.getByText('Spacing')).toBeVisible();
      await panel.getByRole('radio', { name: 'Compact', exact: true }).click();
      await expect(
        page.locator('[data-testid="unit-compact-row"]').first(),
      ).toBeVisible();
      await rec.recordStep(page, '02_display_settings_open');
      await panel.getByRole('radio', { name: 'Normal', exact: true }).click();
      await page.getByTestId('account-menu-back').click();

      // Switch Game list (with inline current game subtext)
      await expect(page.getByTestId('switch-game-current')).toHaveText(
        matchName,
      );
      await page.getByTestId('account-menu-change-game').click();
      const gameList = page.getByTestId('change-game-list');
      await expect(gameList).toBeVisible();
      await expect(
        gameList.getByTestId('change-game-item-solo'),
      ).toHaveAttribute('data-current', 'false');
      await expect(
        gameList.getByTestId(`change-game-item-${created.game_id}`),
      ).toHaveAttribute('data-current', 'true');
      await rec.recordStep(page, '04_change_game_expanded');

      // Switch to Solo Sandbox
      await gameList.getByTestId('change-game-item-solo').click();
      await expect(page.getByTestId('sandbox-mode-indicator')).toHaveCount(0);
      await expect(gameTrigger).toHaveAttribute('data-icon', 'flask');
      await expect(gameTrigger).toHaveAttribute('data-solo-sandbox', 'true');

      // Game Settings menu in Solo Sandbox says "Solo Sandbox", omits Export to Solo Sandbox and Surrender, and shows Reset Sandbox and Return to Previous Game below Administrator
      await gameTrigger.click();
      await expect(page.getByTestId('game-settings-subtitle')).toHaveText(
        'Solo Sandbox',
      );
      await expect(page.getByTestId('game-settings-solo-sandbox')).toHaveCount(
        0,
      );
      await expect(page.getByTestId('game-settings-surrender')).toHaveCount(0);
      await expect(
        page.getByTestId('game-settings-reset-sandbox'),
      ).toBeVisible();
      await expect(
        page.getByTestId('game-settings-return-previous'),
      ).toBeVisible();
      await page.getByTestId('game-settings-admin-settings').click();
      await expect(page.getByTestId('admin-settings-panel')).toBeVisible();
      await rec.recordStep(page, '03_admin_settings_open');
      await page.getByTestId('game-settings-back').click();
      await page.getByTestId('game-settings-reset-sandbox').click();
      await expect(page.getByTestId('toast-banner')).toContainText(
        'Reset to Standard Spring 1901.',
      );

      await rec.recordStep(page, '05_switched_to_solo_sandbox');

      // Confirm Switch Game inline subtext now reads Solo Sandbox, return to previous game, then Sign Out
      await trigger.click();
      await expect(page.getByTestId('switch-game-current')).toHaveText(
        'Solo Sandbox',
      );
      await gameTrigger.click();
      await page.getByTestId('game-settings-return-previous').click();
      await expect(gameTrigger).toHaveAttribute('data-icon', 'crown');
      await expect(page.getByTestId('nav-match-pill')).toHaveCount(0);

      await trigger.click();
      await expect(page.getByTestId('switch-game-current')).toHaveText(
        matchName,
      );
      await page.getByTestId('account-menu-signout').click();
      await expect(trigger).toHaveAttribute('data-signed-in', 'false');
      await rec.recordStep(page, '06_signed_out_guest_mode');

      rec.finalize('PASSED');
    } catch (err) {
      rec.finalize('FAILED');
      throw err;
    }
  });
});
