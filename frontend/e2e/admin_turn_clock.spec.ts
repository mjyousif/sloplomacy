// @scenario admin_turn_clock
// @alias clock
// @alias timer
// @description Issue #393: the host overrides the turn clock from Turn and Clock Settings. Starts the clock, ends the vote with a set time, nudges it, sets two days (players see the end time, not a ticking clock), pauses it (players see "Paused by the Host" with no ready-up and get the admin warning), resumes, saves new clock lengths that the next vote offers, and turns the clock off. Desktop and phone.
import { type Browser, expect, type Page, test } from '@playwright/test';
import { DEFAULT_E2E_API_URL, ScenarioRecorder } from './helpers';

interface Player {
  id: string;
  email: string;
  name: string;
  power: string;
}

const HOST: Player = {
  id: 'local_clock_host',
  email: 'clock.host@example.com',
  name: 'Hana',
  power: 'FRANCE',
};

const GUEST: Player = {
  id: 'local_clock_guest',
  email: 'clock.guest@example.com',
  name: 'Gus',
  power: 'ENGLAND',
};

function demoHeaders(player: Player): Record<string, string> {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: player.id, email: player.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function api(player: Player, path: string, body?: object) {
  const res = await fetch(`${DEFAULT_E2E_API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: demoHeaders(player),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function createMatch(name: string): Promise<string> {
  const created = await api(HOST, '/api/games', {
    name,
    creator_power: HOST.power,
    user_id: HOST.id,
    email: HOST.email,
    display_name: HOST.name,
  });
  await api(GUEST, `/api/games/${created.game_id}/join`, {
    power: GUEST.power,
    user_id: GUEST.id,
    email: GUEST.email,
    display_name: GUEST.name,
  });
  return created.game_id;
}

async function openAs(
  browser: Browser,
  player: Player,
  matchName: string,
  phone = false,
): Promise<Page> {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 1440, height: 900 } },
  );
  await context.addInitScript((user) => {
    localStorage.setItem(
      'diplomacy_1901_local_auth_user',
      JSON.stringify({
        id: user.id,
        email: user.email,
        displayName: user.name,
        isLocalDemo: true,
      }),
    );
  }, player);
  const page = await context.newPage();
  await page.goto('/');
  const row = page
    .locator('[data-testid="featured-game-hero"], [data-testid="my-game-row"]')
    .filter({ hasText: matchName });
  await row.getByRole('button', { name: /^Resume as/ }).click();
  await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
  return page;
}

async function openClockPanel(page: Page) {
  await page.getByTestId('game-settings-trigger').click();
  await page.getByTestId('game-settings-admin-settings').click();
  await page.getByTestId('btn-open-admin-console').click();
  await expect(page.getByTestId('admin-phase-clock')).toBeVisible();
}

async function acknowledgeWarnings(page: Page) {
  const ack = page.getByTestId('admin-warning-acknowledge-btn');
  await expect(ack).toBeVisible({ timeout: 10000 });
  await ack.click();
  await expect(page.getByTestId('admin-action-warning-modal')).toHaveCount(0);
}

test.describe('Scenario: Host overrides the turn clock', () => {
  test('host starts, retimes, pauses, resumes, re-lengths and stops the clock', async ({
    browser,
  }) => {
    const rec = new ScenarioRecorder('admin_turn_clock');
    const matchName = `Clock Override ${Date.now()}`;

    try {
      await createMatch(matchName);
      const host = await openAs(browser, HOST, matchName);
      const guest = await openAs(browser, GUEST, matchName);
      rec.attachListeners(host);
      rec.attachListeners(guest);

      // 1. The section starts with the clock off.
      await openClockPanel(host);
      const status = host.getByTestId('admin-clock-status');
      await expect(status).toContainText('untimed');
      await rec.recordStep(host, 'clock_off');

      // 2. Start it: players are voting.
      await host.getByTestId('btn-admin-clock-running').click();
      await expect(status).toContainText('voting');
      await expect(
        guest.getByTestId('phase-timer-widget').getByText('Vote: Phase Length'),
      ).toBeVisible();

      // 3. End the vote with 90 minutes left, then add 5.
      await host.getByTestId('picker-admin-clock-time-left-amount').fill('90');
      await host
        .getByTestId('picker-admin-clock-time-left-unit')
        .selectOption({ label: 'min' });
      await expect(host.getByTestId('btn-admin-clock-set-left')).toHaveText(
        'End Vote & Set Time',
      );
      await host.getByTestId('btn-admin-clock-set-left').click();
      await expect(status).toContainText('1 h 30 min left');
      await host.getByTestId('btn-admin-clock-nudge-5').click();
      await expect(status).toContainText('1 h 35 min left');
      await expect(guest.getByRole('timer')).toContainText(/^1:3[45]:/);
      await acknowledgeWarnings(guest);
      await rec.recordStep(host, 'host_set_time_and_nudged');
      await rec.recordStep(guest, 'guest_sees_long_clock');

      // 3b. Two days out: players see when it ends, not a ticking clock.
      await host.getByTestId('picker-admin-clock-time-left-amount').fill('2');
      await host
        .getByTestId('picker-admin-clock-time-left-unit')
        .selectOption({ label: 'days' });
      await host.getByTestId('btn-admin-clock-set-left').click();
      await expect(status).toContainText('2 d left');
      await acknowledgeWarnings(guest);
      await expect(
        guest.getByTestId('phase-timer-widget').getByText(/Ends \w{3} /),
      ).toBeVisible();
      await expect(guest.getByRole('timer')).toHaveText('2 d left');
      await rec.recordStep(host, 'host_time_left_picker');
      await rec.recordStep(guest, 'guest_sees_end_time_first');

      // 4. Pause: the guest cannot ready up out of it.
      await host.getByTestId('btn-admin-clock-paused').click();
      await expect(status).toContainText('Only you can resume');
      await acknowledgeWarnings(guest);
      await expect(guest.getByText('Paused by the Host')).toBeVisible();
      await expect(guest.getByTestId('btn-timer-ready')).toHaveCount(0);
      await rec.recordStep(host, 'host_paused_panel');
      await rec.recordStep(guest, 'guest_sees_host_pause');

      // 5. New lengths, then resume: the new vote offers them.
      await host.getByTestId('picker-admin-clock-vote-0-amount').fill('10');
      await host
        .getByTestId('picker-admin-clock-vote-0-unit')
        .selectOption({ label: 'min' });
      await host.getByTestId('picker-admin-clock-vote-1-amount').fill('1');
      await host
        .getByTestId('picker-admin-clock-vote-1-unit')
        .selectOption({ label: 'hours' });
      await host.getByTestId('picker-admin-clock-vote-2-amount').fill('');
      await host.getByTestId('btn-admin-clock-save-lengths').click();
      await acknowledgeWarnings(guest);
      await host.getByTestId('btn-admin-clock-running').click();
      await expect(status).toContainText('voting');
      await acknowledgeWarnings(guest);
      const widget = guest.getByTestId('phase-timer-widget');
      await expect(
        widget.getByRole('button', { name: /10 min/ }),
      ).toBeVisible();
      await expect(widget.getByRole('button', { name: /1 h/ })).toBeVisible();
      await expect(widget.getByRole('button', { name: /20 min/ })).toHaveCount(
        0,
      );
      await rec.recordStep(host, 'host_new_lengths');
      await rec.recordStep(guest, 'guest_votes_on_new_lengths');

      // 6. Turn it off, after confirming.
      await host.getByTestId('btn-admin-clock-off').click();
      await host.getByTestId('btn-confirm-modal-confirm').click();
      await expect(status).toContainText('untimed');
      await acknowledgeWarnings(guest);
      await expect(
        guest.getByText('Waiting for the host to start the clock.'),
      ).toBeVisible();
      await rec.recordStep(guest, 'guest_clock_off');

      // 7. Phone: the same section in the host's sheet.
      const phone = await openAs(browser, HOST, matchName, true);
      rec.attachListeners(phone);
      await phone.getByTestId('game-settings-trigger').click();
      await phone.getByTestId('game-settings-admin-settings').click();
      await phone.getByTestId('btn-open-admin-console').click();
      // Raise the sheet all the way, then bring the Turn Clock card into view inside it.
      const handle = phone.getByTestId('bottom-sheet-handle');
      for (let i = 0; i < 2; i += 1) {
        const snap = await phone
          .locator('[data-snap]')
          .first()
          .getAttribute('data-snap');
        if (snap === 'full') break;
        await handle.tap();
        await phone.waitForTimeout(400);
      }
      await phone
        .getByTestId('admin-phase-clock')
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await expect(phone.getByTestId('btn-admin-clock-off')).toBeVisible();
      await rec.recordStep(phone, 'phone_clock_section');
      rec.finalize('PASSED');
    } catch (error) {
      rec.finalize('FAILED');
      throw error;
    }
  });
});
