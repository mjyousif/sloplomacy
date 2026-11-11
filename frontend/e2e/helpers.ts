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
    this.artifactDir = path.resolve(process.cwd(), '../artifacts/e2e', scenarioName);
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
    fs.writeFileSync(summaryPath, JSON.stringify(this.telemetry, null, 2), 'utf-8');
    if (status === 'PASSED' && hasPageErrors) {
      throw new Error(
        `Scenario ${this.scenarioName} encountered uncaught pageerror(s): ${this.telemetry.pageErrors.join('; ')}`
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
  apiBase: string = DEFAULT_E2E_API_URL
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
    throw new Error(`Failed to seed scenario '${scenarioId}' (${res.status}): ${errText}`);
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
