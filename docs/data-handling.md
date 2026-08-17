# Public repository data-handling policy

Pi Clarify is a public repository. Treat every committed file, pull request, issue, Actions log, and review comment as public and durable.

## Allowed data

Use data that is safe for unrestricted public release:

- Synthetic evaluation prompts and fixtures.
- Public documentation and properly cited public research.
- Aggregated measurements that cannot identify a person or recover a private conversation.
- Placeholder credentials such as `EXAMPLE_API_KEY` or `replace-me`.
- Example email addresses under `example.com`, `example.org`, `example.net`, `.example`, `.test`, or `.invalid`.

## Prohibited data

Do not commit or paste:

- Passwords, API keys, access tokens, cookies, private keys, connection strings, or authenticated URLs.
- `.env` files other than reviewed example templates.
- Pi session files, local agent state, shell history, browser exports, or authentication profiles.
- Raw user conversations, private prompts, production traces, tool arguments, or workspace contents.
- Names, personal email addresses, phone numbers, postal addresses, government identifiers, payment-card numbers, or other personally identifiable information (PII) unless the person explicitly approved public release and the repository needs the value.
- Private repository URLs, internal hostnames, customer identifiers, subscription details, or account metadata.
- Raw evaluation outputs or judgments under `results/raw/` and `results/judgments/`.

Public contributor names and commit metadata are handled by GitHub and Git. Do not copy those identities into fixtures or datasets unless the project needs them.

## Before committing data

1. Prefer synthetic data. Do not "anonymize" a real conversation when a synthetic case can test the same behavior.
2. Minimize fields. Keep only the information required by the hypothesis or test.
3. Replace identities and secrets before the file enters Git history.
4. Check provenance and publication rights for every imported dataset.
5. Review generated files, logs, screenshots, and model outputs manually. Automated scanners are defense in depth, not proof that data is safe.
6. Run `npm run check` and inspect `git diff --cached` before committing.

## Automated checks

The repository uses three layers:

- Secretlint scans files for known credential patterns locally and in continuous integration (CI).
- `scripts/check-data-safety.mjs` rejects high-risk paths, large tracked artifacts, personal home paths, non-example email addresses, private keys, and high-confidence identity/payment patterns.
- GitHub secret scanning and push protection inspect public pushes and repository history for supported secret types.

The custom data check intentionally reports only the file, line, and rule. It does not print the matched value into terminal or CI logs.

## False positives and exceptions

Do not bypass a finding merely to make a check pass. First replace the value with synthetic data or move the artifact outside Git.

If a real public identifier is essential, explain its provenance and necessity in the pull request. Change the scanner only through a reviewed pull request with a narrow test case; do not add broad path or pattern exclusions.

## Incident response

If sensitive data is exposed:

1. Stop sharing the affected link or artifact.
2. Revoke or rotate credentials immediately.
3. Remove affected Actions logs or public attachments where possible.
4. Report the incident through a private GitHub security advisory.
5. Decide whether Git history must be rewritten after containment.
6. Add a synthetic regression test for the class of leak without retaining the exposed value.
