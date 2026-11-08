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
| `backend/**` | `python -m pytest backend/ -v` (every `backend/test_*.py` must pass, not just the file you edited), plus the matching E2E scenario if UI-visible behavior changed |
| `backend/models.py` or `frontend/src/types/diplomacy.ts` | Change **both** files together, then the backend and frontend checks |
| `frontend/src/**` | `cd frontend; npx tsc --noEmit; npm test; npm run build` |
| `EuropeMap.tsx`, sidebars, modals, `compact.css`, `MapPiece.tsx`, phase-flow UI | The relevant E2E scenario (below) |
| `supabase/migrations/**` | Read the `supabase` and `supabase-postgres-best-practices` skills, then see "Migrations" |
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

**Run only the one scenario that covers your change.** Backend changes count: E2E runs against the real backend, so run the matching scenario when you change API responses, adjudication, phase flow, sandbox, validator or auth behavior (for example adjudication or retreats -> etreats, uilds, movement; validator -> lunder; sandbox endpoints -> sandbox). Skip E2E only when nothing a user can see or click could change: docs, comments, refactors fully covered by tests, infra scripts, or internals such as persistence or security headers with no change to responses. Avoid un --all unless the change is broad (shared layout, App.tsx state flow, map rendering across phases), because it is slow and the screenshots cost tokens to read. Look only at the screenshots from the steps your change affects.

Then open those screenshots in `artifacts/e2e/<scenario>/` with `read_file` and **look at them**. Also check `summary.json` for console or page errors. A green exit code with a broken-looking screenshot is a failure. Don't commit `artifacts/`.

## 3. Documentation and contracts (always)

Walk the checklist in AGENTS.md section 5.1 against `git diff --stat`. The ones people forget:

- New or changed endpoint → both the summary table and the detail section of `docs/backend/api-reference.md`.
- New file or component → AGENTS.md section 3 tree and `docs/frontend/README.md`.
- Test counts: don't hardcode a new number in prose. If you add a `test_*.py`, update the list in AGENTS.md.
- A new invariant you had to learn the hard way belongs in AGENTS.md section 4, one bold **Invariant** line.

## 4. Migrations

- Never edit an applied migration. Add a new timestamped file in `supabase/migrations/`.
- RLS stays closed on `multiplayer_games`. The backend uses the service role, and browsers never read the table.
- Migrations must fail loudly in CI and deploys. Don't add `|| true` or swallow errors.

## 5. Report

End with: what you ran, what passed, which screenshots you inspected (scenario, step, and what each showed, or "E2E not run, because ..."), and anything you could not run (say so, don't imply it passed).

## 6. Keep the checks and these skills current

Verification only stays useful if it grows with the product. When your change adds user-visible behavior that **no existing scenario covers** (a new screen, modal, phase flow, or sandbox or lobby path), add coverage in the same PR:

1. Add `frontend/e2e/<topic>.spec.ts`, reusing `frontend/e2e/helpers.ts`. Capture a screenshot at each meaningful step, and use the spec's file name (without `.spec.ts`) as the `ScenarioRecorder` name.
2. Start the file with two header comments: `// @scenario <short name>` and `// @description <one line>`. That is the whole registration. `scripts/e2e_runner.py` discovers specs in `frontend/e2e/`, so `list`, `run <name>` and `run --all` pick it up. Check that `python scripts/e2e_runner.py list` shows it and that it passes.
3. Add it to the scenario mapping in section 2 above and to `docs/guides/development.md`. Don't hardcode a scenario list in `AGENTS.md`; point to `list`.

Don't add a scenario for something an existing one already walks through. Extend that scenario instead. If a change makes a scenario obsolete or wrong, fix or remove it and update the same lists.

If you hit a recurring mistake or a rule that these skills don't cover (a new invariant, a path that leaked, a check that was missing), add it to the matching skill or the AGENTS.md invariants in the same PR, and mention it in the PR description. Keep additions short, and delete advice that has gone stale.
