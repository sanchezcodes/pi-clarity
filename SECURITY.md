# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability or suspected credential exposure. Use GitHub's private vulnerability reporting for this repository instead:

<https://github.com/sanchezcodes/pi-clarity/security/advisories/new>

Include the affected version or commit, reproduction steps, impact, and any suggested remediation. Do not include real credentials, personal data, or private traces in the report unless they are strictly necessary; redact them whenever possible.

## Supported versions

Until the project reaches `1.0.0`, security fixes target the latest commit on `main`. After a release policy is established, this section will list supported release lines.

## Exposed secrets

If a real credential reaches a commit, issue, pull request, Actions log, or other public surface:

1. Revoke or rotate it immediately.
2. Remove the public artifact or log where possible.
3. Open a private security advisory to coordinate any repository cleanup.

Rewriting Git history does not make an exposed credential safe again. Rotation is the required first response.
