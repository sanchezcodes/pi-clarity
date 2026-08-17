# Contributing

Thank you for helping improve Pi Clarify.

## Development setup

This project requires Node.js 22 or newer.

```bash
npm ci
npm run check
```

`npm ci` installs a Husky pre-commit hook. The hook formats supported staged files, runs Secretlint, applies the repository data-safety policy, type-checks the project, and runs the tests.

## Pull requests

1. Create a topic branch from `main`.
2. Keep each pull request focused on one change.
3. Add or update tests for behavior changes.
4. Run `npm run check`.
5. Open a pull request and complete the data-provenance section.

The `main` branch requires a pull request, passing CI, resolved review conversations, and linear history. The repository allows squash and rebase merges.

## Evaluation changes

Evaluation cases must remain independent from candidate prompt wording. Preserve raw model outputs outside Git, record the metadata required by `AGENTS.md`, and never let readability compensate for a correctness or task-completion failure.

Research notes must cite primary sources. Changes to frozen hypotheses, bars, judging protocols, or case sets require a new version committed before new results are inspected.

## Data and security

Read [`docs/data-handling.md`](docs/data-handling.md) before adding cases, traces, model outputs, fixtures, screenshots, logs, or imported data.

Use synthetic public-safe data. Never commit credentials, Pi session files, raw private conversations, production traces, personal information, or artifacts copied from a private workspace.

Report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md). Do not open a public security issue before a fix is available.
