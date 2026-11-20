---
name: verify-change
description: Use before declaring any code change done or opening a PR. Runs the right backend, frontend and E2E checks for the files touched, then walks the documentation and type-contract checklist. Triggers - finishing a feature or fix, "is this ready", pre-PR checks, CI failures.
---

# Verify a change

Run from the repo root. Work out what you touched first (`git diff --stat origin/main`), then run only what applies, but never skip the docs step.

In a fresh worktree run `npm ci` in `frontend/` (and `pip install -r backend/requirements.txt`) first, or the dev servers won't start.

## 1. Pick the checks

| You touched | Run |
| :--- | :--- |
| `backend/**` | `python -m pytest backend/ -v` (every `backend/tests/**/test_*.py` must pass, not just the file you edited), plus the matching E2E scenario if UI-visible behavior changed |
| `backend/domain/*.py` or `frontend/src/types/diplomacy.ts` | Change **both** files together, then the backend and frontend checks |
| `frontend/src/**` | `cd frontend; npm run lint; npx tsc --noEmit; npm test; npm run build` (run `npm run format` first after scripted/bulk edits, since Windows defaults to `CRLF`) |
| `EuropeMap.tsx`, sidebars, modals, any `*.module.css`, `MapPiece.tsx`, phase-flow UI | The relevant E2E scenario (below) |
| `supabase/migrations/**` | Read the `supabase` and `supabase-postgres-best-practices` skills, then see "Migrations" |
| `backend/telemetry.py`, `scripts/sync_gcp_monitoring.py`, `terraform/monitoring.tf`, `terraform/dashboards.tf` | Run `python -m pytest backend/tests/unit/test_telemetry.py -v` and `python scripts/sync_gcp_monitoring.py --project test --dry-run`, and keep `docs/guides/observability-and-dashboards.md` updated |
| `scripts/`, `Dockerfile`, `terraform/`, `.github/` | Re-read the matching section of `docs/guides/google-cloud-deployment.md` and run the script's dry or help mode if it has one |

`scripts/test.ps1` / `scripts/test.sh` run pytest, vitest, and the build in one go (`-E2E` / `--e2e` adds the browser scenarios).

## 2. E2E scenarios (`scripts/e2e_runner.py`)

`python scripts/e2e_runner.py list` shows them. Map the change to one:

- orders, arrows, map clicks → `movement`
- sandbox or War Room → `sandbox`
- Sanity Check modal, validator → `blunder`
- retreats or dislodgement → `retreats`
- winter builds or disbands → `builds`
- anything phone or `compact` → `mobile`
- turn selector, past turns on the map, `/api/history` → `history`
- convoy reachability, fleet chains, green/blue convoy highlights → `convoy_scenarios`
- Game Over modal, victory conclusion, winner pill → `game_over`
- press (chat), its section in the tools sidebar, `/api/press` → `press`
- homepage for a player with games: map hero, mini map, other-games strip, `board` on `/api/games/mine` → `lobby_home`
- the lobby's public game browser, its filters, rows and seat claims, `/api/games/browse` → `lobby_browser`
- unified top-bar dropdown, profile header, Display Settings, Administrator, Change Game, Sign Out → `top_bar_menu`

**Run only the scenarios that cover your change.** Backend changes count: E2E runs against the real backend, so run the matching scenario when you change API responses, adjudication, phase flow, sandbox, validator or auth behavior (for example adjudication or retreats -> `retreats`, `builds`, `movement`; validator -> `blunder`; sandbox endpoints -> `sandbox`). **Whenever you touch top-bar menus, sidebars, order controls, map HUD overlays, modals, or lobby layout, run both the matching desktop scenario and `mobile` (`390×844`) and inspect screenshots from both.** Skip E2E only when nothing a user can see or click could change: docs, comments, refactors fully covered by tests, infra scripts, or internals such as persistence or security headers with no change to responses. Avoid `run --all` unless the change is broad (shared layout, App.tsx state flow, map rendering across phases), because it is slow and the screenshots cost tokens to read. Look only at the screenshots from the steps your change affects.

Then evaluate the screenshots. The E2E suite exists so that **you** read them. A green Playwright exit only means the scripted clicks worked, not that the UI is right.

1. **Before running**, write down what the affected steps should show (for example, "arrow from Paris to Burgundy, warning badge on both cards, modal lists the self-bounce").
2. Run the scenario, then open the screenshots for those steps with `read_file`. Open them all if the change touches shared layout.
3. **Compare each image to your expectation**, element by element: right provinces and arrows, units and rings drawn cleanly, text not clipped or overlapping, correct phase and turn label, no stray modal or stuck highlight, and correct behavior at the viewport used (`mobile` is 390x844).
4. Check `summary.json` for `consoleErrors` and `pageErrors`.
5. If an image looks wrong, the change fails even though the test passed. Fix it and rerun. If a scenario's script no longer matches the intended behavior, update the spec.
6. For a **new** scenario, capture a screenshot after every meaningful state change, name the steps by what they show, and add Playwright assertions for the critical facts so the run fails loudly as well.
7. Report what each opened screenshot showed (see section 5). Don't claim a pass for images you didn't open.

Don't commit `artifacts/`.
## 3. Documentation and contracts (always)

Walk the checklist in AGENTS.md section 5.1 against `git diff --stat`. Docs describe **systems, features, and cross-component interactions** (with Mermaid diagrams and invariants)—never file-by-file or helper-by-helper inventories.

- New or changed user-facing feature (or user-visible behavior change) → update or add the matching doc in `docs/features/` and index it in `docs/README.md`.
- Changes to runtime/infra, persistence/concurrency, secrecy, or auth → update the matching doc in `docs/architecture/` (`runtime-and-infrastructure.md`, `consistency-and-persistence.md`, `secrecy-and-authorization.md`, `identity-and-auth.md`).
- New or changed endpoint → both the summary table and the detail section of `docs/backend/api-reference.md`.
- Package boundary or top-level directory change → verify package boundaries in `AGENTS.md` section 3 and update `docs/frontend/README.md` or `docs/backend/README.md` (do not add per-helper file lists).
- Any created or edited doc in `docs/` → keep its `## Contents` table of contents and relative links up to date.
- File size & modularity: ensure no touched file grew into an unmaintainable monolith (> 500 lines). Follow `.agents/skills/codebase-modularity/SKILL.md` and decompose when necessary.
- Test counts: don't hardcode a new number in prose. A new `test_*.py` goes where the layout in `docs/backend/README.md` (Running Backend Tests) puts it; there is no list of suites to update. Run it on its own once to make sure it doesn't lean on tests that happen to run before it.
- A new invariant you had to learn the hard way belongs in AGENTS.md section 4, one bold **Invariant** line.

## 4. Migrations

- Never edit an applied migration. Add a new timestamped file in `supabase/migrations/`.
- RLS stays closed on `multiplayer_games`. The backend uses the service role, and browsers never read the table.
- Migrations must fail loudly in CI and deploys. Don't add `|| true` or swallow errors.

## 5. Report

End with: what you ran, what passed, which screenshots you inspected (scenario, step, and what each showed, or "E2E not run, because ..."), and include/link the after-screenshots for any visual or user-facing behavior change. Report anything you could not run (say so, don't imply it passed).

## 6. Keep the checks and these skills current

Verification only stays useful if it grows with the product. When your change adds user-visible behavior that **no existing scenario covers** (a new screen, modal, phase flow, or sandbox or lobby path), add coverage in the same PR:

1. Add `frontend/e2e/<topic>.spec.ts`, reusing `frontend/e2e/helpers.ts`. Capture a screenshot at each meaningful step, and use the spec's file name (without `.spec.ts`) as the `ScenarioRecorder` name.
2. Start the file with two header comments: `// @scenario <short name>` and `// @description <one line>`. That is the whole registration. `scripts/e2e_runner.py` discovers specs in `frontend/e2e/`, so `list`, `run <name>` and `run --all` pick it up. Check that `python scripts/e2e_runner.py list` shows it and that it passes.
3. Add it to the scenario mapping in section 2 above and to `docs/guides/development.md`. Don't hardcode a scenario list in `AGENTS.md`; point to `list`.

Don't add a scenario for something an existing one already walks through. Extend that scenario instead. If a change makes a scenario obsolete or wrong, fix or remove it and update the same lists.

If you hit a recurring mistake or a rule that these skills don't cover (a new invariant, a path that leaked, a check that was missing), add it to the matching skill or the AGENTS.md invariants in the same PR, and mention it in the PR description. Keep additions short, and delete advice that has gone stale.
