# Runbook: GitHub setup (first push)

Do these steps once, as a human with admin rights on the repository.

## 1. Create the repository and push

```bash
gh repo create <org>/bseat --private --source . --remote origin
git push -u origin main
git push -u origin chore/000-dev-environment feat/001-seat-booking   # open PRs from these
```

## 2. Protect `main`

Settings → Rules → Rulesets → New branch ruleset for `main`:

- Require a pull request before merging, with **1 approval**. Dismiss stale approvals on push.
  Require review from Code Owners once a `CODEOWNERS` file is added.
- Require status checks to pass, with branches up to date:
  `Lint, typecheck, format, commits` · `Unit + integration tests, coverage, contract drift` ·
  `Build` · `E2E + accessibility + API fuzzing` · `Secrets, SAST, dependency and image scan`
- Block force pushes and deletions. Require linear history (squash merge).

Or with the CLI (after the first CI run so the check names exist):

```bash
gh api -X POST repos/<org>/bseat/rulesets --input docs/runbooks/main-ruleset.json
```

## 3. Security features

Settings → Code security: enable Dependabot alerts and security updates, and secret scanning
with push protection. Dependabot version updates are already configured in
`.github/dependabot.yml`.

## 4. Tokens for AI tooling (local, never committed)

The GitHub MCP server reads `GITHUB_PERSONAL_ACCESS_TOKEN` from your shell:

1. github.com → Settings → Developer settings → Fine-grained tokens → Generate.
2. Repository access: only this repo. Permissions: Contents (read), Issues (read/write),
   Pull requests (read/write), Actions (read), Metadata (read).
3. `export GITHUB_PERSONAL_ACCESS_TOKEN=…` in your shell profile or password-manager CLI.
4. In Claude Code run `/mcp` and enable `github`.

Agents still cannot merge: `.claude/settings.json` denies the merge command, and the
ruleset requires a human approval.

## 5. AWS (later)

Deployment is designed in ADR-0007 (status Proposed). CI will authenticate to AWS through
GitHub OIDC; no long-lived AWS keys go into GitHub secrets.
