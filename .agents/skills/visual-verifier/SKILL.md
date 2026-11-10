---
name: visual-verifier
description: Playbook for running headless Playwright tests, inspecting visual diff snapshots and failure artifacts under frontend/test-results/, and distilling visual failures into compact markdown summaries (<300 tokens).
---

# Visual Verifier

This skill guides `lead-scout` in executing Playwright tests in headless mode, inspecting visual diff snapshots, and generating ultra-compact failure summaries (< 300 tokens) to maintain token efficiency.

## 1. Headless Test Execution

Run Playwright tests strictly headlessly and target specific spec files to save compute and context:

```bash
# In frontend/ directory:
npx playwright test e2e/<file>.spec.ts --project=chromium --headed=false

# Or via fullstack runner from repo root:
python scripts/e2e_runner.py run <scenario_name>
```

Key environment options:
- `PLAYWRIGHT_CHANNEL=chromium`: Uses bundled Chromium for consistent rendering in headless environments.
- Target only the scenario touching your changes (e.g. `e2e/movement_and_orders.spec.ts`, `e2e/retreats_dislodgement.spec.ts`, `e2e/winter_builds.spec.ts`).

## 2. Artifact Locations & Snapshot Inspection

When an assertion or visual comparison fails, Playwright saves screenshots and diffs:

- **Playwright Test Results**: `frontend/test-results/`
  - `[test-name]/test-failed-1.png`: Screenshot captured at point of failure.
  - `[test-name]/[snapshot-name]-diff.png`: Visual pixel diff (highlighting mismatched pixels in magenta).
  - `[test-name]/[snapshot-name]-actual.png`: The actual rendered browser state.
  - `[test-name]/[snapshot-name]-expected.png`: Baseline golden reference.
- **E2E Runner Scenarios**: `artifacts/e2e/<scenario_name>/`
  - Step screenshots: `step_01_*.png`, `step_02_*.png`, etc.
  - Telemetry & error summary: `summary.json`.

Use multimodal vision (`view_image` or `read_file`) to inspect the diff or failure screenshot directly.

## 3. Compact Failure Formatting (< 300 Tokens)

Never paste raw HTML DOM trees, full stack traces, or terminal output blocks. Format the failure into this concise markdown report:

```markdown
### Visual Failure: [Scenario / Test Name]
- **File & Line**: `frontend/e2e/<file>.spec.ts:<line>`
- **Failed Assertion**: `expect(page.locator(...)).toBeVisible()` or `expect(canvas).toHaveScreenshot()`
- **Screenshot Path**: `frontend/test-results/<test_dir>/test-failed-1.png`
- **Visual Defect**: [1-2 sentences: e.g. "Fleet in STP was rendered at land centroid (x=800, y=250) instead of NC coast position (x=812, y=190); coastal flag did not appear."]
- **Remediation Target**: [Component/file requiring fix: e.g. `frontend/src/components/map/layers/UnitsLayer.tsx`]
```

## 4. Verification Guardrails

- [ ] Command ran headlessly (`--headed=false` or default runner).
- [ ] Failure summary is strictly under 300 tokens.
- [ ] Screenshot path is clearly identified for multimodal inspection.
- [ ] No raw DOM or multi-page console log streams included.
