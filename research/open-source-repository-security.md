# Open-source repository protection and data-safety baseline

## Recommendation

Protect `main` with an active GitHub branch ruleset, require pull requests and CI, block deletion and force pushes, and keep history linear. For a solo-maintained project, require zero approvals initially so the maintainer can merge their own pull requests; add one independent approval when a second regular maintainer exists.

Use layered data protection rather than one scanner: a local staged-file hook, CI checks, GitHub secret scanning and push protection, a written public-data policy, and manual diff review. Secret scanners target credentials; they do not establish that arbitrary model outputs or datasets are free of personally identifiable information (PII).

## Repository ruleset

GitHub rulesets are available for public repositories on GitHub Free. They can require pull requests, status checks, linear history, signed commits, and protection against deletion or force pushes. Active rulesets are visible to anyone with repository read access, which makes the protection auditable by contributors. [GitHub, “About rulesets”](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)

The recommended `main` rules are:

| Rule                    | Decision          | Reason                                                                                                                                        |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Require pull request    | Enable            | Every change receives a public review surface and CI result. GitHub permits zero required approvals while still requiring a PR.               |
| Required approvals      | Start at 0        | One required approval would prevent a solo maintainer from merging without a second trusted reviewer. Raise to 1 when maintainership expands. |
| Resolve review threads  | Enable            | Open review objections must be acknowledged before merge.                                                                                     |
| Required status check   | Require `quality` | Type checking, tests, secret scanning, and data-safety checks become merge gates.                                                             |
| Strict/up-to-date check | Enable            | Tests run against the current base before merge, accepting the extra CI run.                                                                  |
| Linear history          | Enable            | Restricts merges to squash or rebase and makes changes easier to trace and revert.                                                            |
| Block deletion          | Enable            | Protects the default branch from accidental removal.                                                                                          |
| Block force pushes      | Enable            | Prevents approved history from being replaced.                                                                                                |
| Signed commits          | Defer             | Useful provenance, but creates disproportionate onboarding friction for a small public project. Revisit for releases or multiple maintainers. |
| Code-owner approval     | Defer             | `CODEOWNERS` still signals ownership, but mandatory owner review has the same solo-maintainer deadlock as one required approval.              |

GitHub documents that required checks block merges until the named check passes; strict mode additionally requires the topic branch to be current with the base. Linear history requires squash or rebase merging. [GitHub, “Available rules for rulesets”](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

No administrator bypass is recommended for normal work. Emergency changes can be made by temporarily changing the ruleset with an auditable repository administration event, rather than leaving a permanent bypass that silently weakens every merge.

## Secrets and sensitive data

GitHub secret scanning scans full Git history, branches, issues, pull requests, discussions, and other public surfaces for supported credential patterns. Public repositories receive secret scanning for free. A detected credential must be rotated; removing it from history is not a substitute for revocation. [GitHub, “Secret scanning”](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)

GitHub push protection blocks supported secrets before they reach a public repository, including command-line pushes, web uploads, REST API requests, and GitHub MCP interactions. User-level protection is enabled by default, while repository-level controls depend on the repository plan and settings. [GitHub, “Push protection”](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)

Secretlint is a Node.js credential scanner designed for project, pre-commit, and CI integration. Its recommended preset covers common providers and private-key or connection-string patterns; findings are masked by default so the scanner does not reproduce a detected secret in logs. [Secretlint project documentation](https://github.com/secretlint/secretlint)

A separate local check is still required for project-specific risks. Pi Clarify handles model outputs and evaluation artifacts, so the repository should reject raw result directories, Pi session exports, databases, traffic captures, local home paths, non-example email addresses, and other high-confidence personal-data patterns before commit. This check must avoid printing matched values.

## GitHub Actions and dependencies

GitHub recommends least-privilege `GITHUB_TOKEN` permissions and pinning third-party actions to full commit SHAs, which is the only immutable way to reference an action release. Public repositories should avoid self-hosted runners for untrusted pull requests because contributor code can persistently compromise the runner. [GitHub, “Secure use reference”](https://docs.github.com/en/actions/reference/security/secure-use)

The CI workflow therefore uses GitHub-hosted runners, grants only `contents: read`, and pins `actions/checkout` and `actions/setup-node` to full SHAs. It does not use `pull_request_target`, write tokens, repository secrets, or private infrastructure.

Dependabot security updates are available for all repositories and can open pull requests for patchable vulnerable dependencies. A `dependabot.yml` file also supports scheduled npm and GitHub Actions version updates. [GitHub, “Dependabot security updates”](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)

OpenSSF Scorecard is useful as a periodic heuristic for branch protection, dependency updates, token permissions, pinned actions, and security policy. OpenSSF explicitly says Scorecard is not a definitive or one-size-fits-all standard, so individual findings should guide work rather than an aggregate score becoming a hard objective. [OpenSSF Scorecard](https://github.com/ossf/scorecard)

## Files and controls implemented

- `.github/workflows/ci.yml` — required `quality` check with read-only permissions and SHA-pinned actions.
- `.github/dependabot.yml` — weekly npm and GitHub Actions updates.
- `.github/CODEOWNERS` — visible ownership for security-sensitive paths.
- `.github/pull_request_template.md` — validation and data-provenance checklist.
- `SECURITY.md` — private vulnerability reporting and credential-rotation response.
- `CONTRIBUTING.md` — pull-request and evaluation workflow.
- `docs/data-handling.md` — allowed/prohibited public data and incident response.
- `.secretlintrc.json` — recommended Secretlint rules.
- `.husky/pre-commit` and `.lintstagedrc.json` — local staged-file enforcement.
- `scripts/check-data-safety.mjs` — project-specific path and PII guardrails.

## Remaining limitations

Regex and provider-pattern scanners produce both false positives and false negatives. They cannot determine consent, publication rights, whether a rare identifier identifies a person, or whether apparently anonymized text can be reidentified from context.

Human review therefore remains mandatory for datasets, traces, screenshots, logs, and model outputs. The safe default is not to commit raw data: retain it in ignored local storage, publish only synthetic cases and non-identifying aggregate analysis, and document provenance in the pull request.
