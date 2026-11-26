import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface ScenarioTelemetry {
  scenario: string;
  timestamp: string;
  steps: { step: number; name: string; screenshot: string }[];
  consoleErrors: string[];
  pageErrors: string[];
  status: 'PASSED' | 'FAILED';
}

export class ScenarioRecorder {
  private scenarioName: string;
  private artifactDir: string;
  private stepCount: number = 0;
  private telemetry: ScenarioTelemetry;

  constructor(scenarioName: string) {
    this.scenarioName = scenarioName;
    this.artifactDir = path.resolve(
      process.cwd(),
      '../artifacts/e2e',
      scenarioName,
    );
    if (!fs.existsSync(this.artifactDir)) {
      fs.mkdirSync(this.artifactDir, { recursive: true });
    }
    this.telemetry = {
      scenario: scenarioName,
      timestamp: new Date().toISOString(),
      steps: [],
      consoleErrors: [],
      pageErrors: [],
      status: 'PASSED',
    };
  }

  attachListeners(page: Page) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected favicon or harmless warning noise
        if (!text.includes('favicon.ico') && !text.includes('[vite]')) {
          this.telemetry.consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      this.telemetry.pageErrors.push(err.message);
      this.telemetry.status = 'FAILED';
    });
  }

  async recordStep(page: Page, stepName: string): Promise<string> {
    this.stepCount += 1;
    const sanitizedName = stepName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `step_${String(this.stepCount).padStart(2, '0')}_${sanitizedName}.png`;
    const fullPath = path.join(this.artifactDir, filename);

    // Wait for animations and network idle
    await page.waitForTimeout(300);
    await page.screenshot({ path: fullPath, fullPage: false });

    this.telemetry.steps.push({
      step: this.stepCount,
      name: stepName,
      screenshot: fullPath,
    });

    return fullPath;
  }

  finalize(status: 'PASSED' | 'FAILED') {
    const hasPageErrors = this.telemetry.pageErrors.length > 0;
    const finalStatus: 'PASSED' | 'FAILED' =
      status === 'FAILED' || this.telemetry.status === 'FAILED' || hasPageErrors
        ? 'FAILED'
        : 'PASSED';
    this.telemetry.status = finalStatus;
    const summaryPath = path.join(this.artifactDir, 'summary.json');
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(this.telemetry, null, 2),
      'utf-8',
    );
    if (status === 'PASSED' && hasPageErrors) {
      throw new Error(
        `Scenario ${this.scenarioName} encountered uncaught pageerror(s): ${this.telemetry.pageErrors.join('; ')}`,
      );
    }
  }
}

export const DEFAULT_E2E_API_URL =
  process.env.E2E_API_URL || 'http://localhost:8000';

export async function seedScenario(
  scenarioId: string,
  gameId: string = 'proto_1901',
  activePower?: string,
  apiBase: string = DEFAULT_E2E_API_URL,
) {
  const payload: Record<string, string> = {
    scenario_id: scenarioId,
    game_id: gameId,
  };
  if (activePower) {
    payload.active_power = activePower;
  }
  const res = await fetch(`${apiBase}/api/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(
      `Failed to seed scenario '${scenarioId}' (${res.status}): ${errText}`,
    );
  }
  return await res.json();
}

/**
 * Places one unit through the Direct-Edit commit (POST /api/admin/board-edit), the only admin
 * route that adds units. Whatever stood in the province is replaced.
 */
export async function spawnUnit(
  power: string,
  unitType: 'A' | 'F',
  province: string,
  gameId: string = 'proto_1901',
  apiBase: string = DEFAULT_E2E_API_URL,
) {
  const stateRes = await fetch(`${apiBase}/api/game?game_id=${gameId}`);
  if (!stateRes.ok) {
    throw new Error(
      `Board read failed (${stateRes.status}): ${await stateRes.text()}`,
    );
  }
  const { state } = await stateRes.json();
  const prov = province.toUpperCase();
  const units = (state.units as Array<Record<string, unknown>>).filter(
    (u) => u.province !== prov,
  );
  units.push({
    id: `${power.slice(0, 3)}_${unitType}_${prov}`,
    power,
    unit_type: unitType,
    province: prov,
    coast: null,
    is_dislodged: false,
  });
  const res = await fetch(`${apiBase}/api/admin/board-edit?game_id=${gameId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expected_revision: state.board_revision ?? state.state_revision,
      expected_season: state.season,
      expected_year: state.year,
      expected_phase: state.phase,
      units,
      ownership: state.ownership,
      // The guest acts as the admin, so the warning it logs is acknowledged for this viewer.
      user_id: 'guest',
    }),
  });
  if (!res.ok) {
    throw new Error(`Spawn failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

/** Sets one unit's order through the API, as if its player had made it. */
export async function postOrder(
  order: Record<string, unknown>,
  gameId: string = 'proto_1901',
  apiBase: string = DEFAULT_E2E_API_URL,
) {
  const res = await fetch(`${apiBase}/api/order?game_id=${gameId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: { is_explicit: true, ...order } }),
  });
  if (!res.ok)
    throw new Error(`Order failed (${res.status}): ${await res.text()}`);
}

/** Resolves the current phase through the API. */
export async function resolvePhase(
  gameId: string = 'proto_1901',
  apiBase: string = DEFAULT_E2E_API_URL,
) {
  const res = await fetch(`${apiBase}/api/adjudicate?game_id=${gameId}`, {
    method: 'POST',
  });
  if (!res.ok)
    throw new Error(`Adjudication failed (${res.status}): ${await res.text()}`);
}

/**
 * Spring 1901 resolved: France and Germany both moved to Burgundy and bounced, and England
 * sailed into the North Sea. The game is left on Fall 1901 Movement.
 */
export async function playBurgundyBounce(gameId: string = 'proto_1901') {
  await seedScenario('standard_1901', gameId, 'FRANCE');
  const army = { unit_type: 'A', order_type: 'MOVE', target: 'BUR' };
  await postOrder(
    { ...army, unit_id: 'FRA_A_PAR', power: 'FRANCE', origin: 'PAR' },
    gameId,
  );
  await postOrder(
    { ...army, unit_id: 'GER_A_MUN', power: 'GERMANY', origin: 'MUN' },
    gameId,
  );
  await postOrder(
    {
      unit_id: 'ENG_F_LON',
      power: 'ENGLAND',
      unit_type: 'F',
      origin: 'LON',
      order_type: 'MOVE',
      target: 'NTH',
    },
    gameId,
  );
  await resolvePhase(gameId);
}

/**
 * Clicks (or, with `tap`, taps) a province on the map the way a player would: at a point
 * inside its own shape that nothing else (a unit, a star, a name) covers. The middle of a
 * province's box can fall in a neighbour, so a plain `click()` on its path is not safe.
 */
export async function clickProvince(
  page: Page,
  provinceId: string,
  { tap = false }: { tap?: boolean } = {},
) {
  const shape = page.locator(
    `[data-testid="province-path"][data-province-id="${provinceId}"]`,
  );
  await shape.waitFor({ state: 'visible' });
  const point = await shape.evaluate((el) => {
    const path = el as SVGPathElement;
    const ctm = path.getScreenCTM();
    if (!ctm) return null;
    const toUser = ctm.inverse();
    const box = path.getBoundingClientRect();
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    const steps = 24;
    const candidates: [number, number][] = [];
    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        candidates.push([
          box.x + (box.width * i) / steps,
          box.y + (box.height * j) / steps,
        ]);
      }
    }
    candidates.sort(
      ([ax, ay], [bx, by]) =>
        Math.hypot(ax - midX, ay - midY) - Math.hypot(bx - midX, by - midY),
    );
    for (const [x, y] of candidates) {
      const user = new DOMPoint(x, y).matrixTransform(toUser);
      if (!path.isPointInFill(user)) continue;
      if (document.elementFromPoint(x, y) !== path) continue;
      return { x, y };
    }
    return null;
  });
  if (!point) {
    throw new Error(`No uncovered point inside ${provinceId} to click`);
  }
  if (tap) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
