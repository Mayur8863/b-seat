# Changesets

Every PR that changes behaviour adds one: `bin/pnpm changeset`, then pick the
packages and the semver bump (patch / minor / major) and write a one-line,
user-facing summary. On release, `pnpm changeset version` bumps versions and
writes CHANGELOG.md files. See CONTRIBUTING.md.
