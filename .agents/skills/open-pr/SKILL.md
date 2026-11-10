---
name: open-pr
description: Use when committing, pushing, opening or updating a pull request for this project, or when a PR has merge conflicts. Covers branch naming, PR description format, the PowerShell --body-file rule, stacked-PR conflicts after squash merges, and cleanup.
---

# Open a PR

`main` is protected: PRs only, 1 approval (dismissed by every new push), CI `Backend Tests (Pytest)` and `Frontend Tests & Build Check`, squash merge. The PR title and body become the commit on `main`, so write them well.

## Before pushing

1. Run the `verify-change` skill.
2. `git fetch origin; git merge origin/main` (or rebase) so you test against current `main`. Other PRs land quickly.
3. Branch names: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`. Titles use Conventional Commits, like `fix(security): show hidden orders only to the seat that holds them`.

## Description (write to a file, never inline)

PowerShell turns backticks and `$vars` in an inline `--body` into garbage. Always:

```powershell
# write the body to a scratch file first
gh pr create --title "<title>" --body-file .pr_body.md
Remove-Item .pr_body.md
```

Use `gh pr edit <n> --body-file ...` to update. Never commit the body file.

Body format that has worked well here:

- **Summary**: one or two sentences on the problem and the user-visible effect.
- **What changed**: a table or short list. For security or behavior fixes use a Before / Now table, one row per path.
- **Why this approach**: the invariant it protects, with the AGENTS.md section if one applies.
- **Verification**: counts and commands actually run (pytest, `tsc`, vitest, build, E2E scenario and screenshots checked). If a run was skipped, say so.
- **Screenshots inspected (Mandatory for visual/behavior changes)**: name the scenario, the steps you opened, and what each showed (for example, "step 2: modal lists the Burgundy self-bounce"). Opening and referencing the images is mandatory whenever user-facing UI, layout, map rendering, or diagnostics change.
- **After Screenshots**: include or embed visual evidence of the new behavior in the PR description or task summary.
- **Deploy notes**: new secrets, env vars, migrations, or "nothing needed". Reviewers act on this.
- `Closes #<issue>` when there is one.

## Attaching screenshots

For visual changes (layout, map, piece styles, phone layout), attach one or two key screenshots from `artifacts/e2e/<scenario>/` as a PR comment. Backend-only or logic changes don't need images. Needs `gh` 2.99+ and write access:

```powershell
gh pr comment <n> --body-file .pr_comment.md --attach "artifacts/e2e/<scenario>/step_02_<name>.png#What it shows"
```
Alt text goes after `#`. If the comment body references the file as `![alt](./path.png)`, the link is rewritten to the uploaded asset. Never commit `artifacts/`.

## Stacked PRs and conflicts

Squash merging rewrites history, so a branch that was cut from another open PR conflicts as soon as the parent merges (this happened with #100 under #101 and #103).

- Prefer branching from `main`. Only stack when truly dependent, and say "merge after #N" at the top of the body.
- After the parent is squash-merged: `git fetch origin; git merge origin/main`. Where both sides carry the same parent change, keep your version of the identical hunks. Don't re-apply the parent.
- Re-run all checks after resolving. The push dismisses the approval, so tell the reviewer to re-approve.

## Don't

- Push to `main`, force-push over a reviewed branch without saying so, or disable checks.
- Leave docs out of the PR. The docs checklist in AGENTS.md section 5.1 is part of the change.
- Bundle unrelated fixes. Small single-topic PRs were reviewed and merged fastest.
