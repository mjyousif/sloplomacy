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

export async function seedScenario(
  scenarioId: string,
  gameId: string = 'proto_1901',
  activePower?: string,
  apiBase: string = 'http://localhost:8000'
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
