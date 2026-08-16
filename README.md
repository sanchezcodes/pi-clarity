# pi-clarity

`pi-clarity` is a small, always-on Pi extension that appends a model-aware response-presentation contract before each agent run. It changes presentation instructions only: it does not post-process responses and does not make nested model calls.

The repository also contains the evaluation harness and evidence used to choose the contracts.

## Install globally

Review the extension source before installing because Pi packages run with your user permissions. Then install the Git package:

```bash
pi install git:github.com/sanchezcodes/pi-clarity
```

Start Pi, or run `/reload` in an existing interactive Pi session. Verify the active contract with:

```text
/clarity status
```

A footer status and notification show whether clarity is on, the selected contract, and the active `provider/model`.

> If you already have readability or response-presentation rules in `~/.pi/agent/APPEND_SYSTEM.md` or a project `APPEND_SYSTEM.md`, remove those rules before enabling this package. Keeping both duplicates or conflicts with the extension instructions.

## Behavior

The extension is enabled by default for each session and appends to Pi's existing system prompt; it never replaces that prompt.

| Active model id | Contract file |
| --- | --- |
| `gpt-5.6-sol` | `prompts/strong.md` |
| `claude-opus-5` | `prompts/balanced.md` |
| Any other or unknown model | `prompts/balanced.md` |

Selection keys primarily on the exact model id, so the same model works through different providers. Provider and model are still recorded in `/clarity status` and the footer. The Markdown files above are loaded directly by the extension and remain the single source of truth.

Use the session-scoped command to inspect or toggle the contract:

```text
/clarity status
/clarity off
/clarity on
```

The setting is stored in the current Pi session, including across `/reload`; a new session defaults to on.

## Update

Update the package and reload Pi resources:

```bash
pi update git:github.com/sanchezcodes/pi-clarity
```

Then run:

```text
/reload
/clarity status
```

Unpinned Git installs track the repository's current default branch when updated. If you installed a pinned `@ref`, install the desired new ref explicitly.

## Uninstall

Remove the global package:

```bash
pi uninstall git:github.com/sanchezcodes/pi-clarity
```

Restart Pi or run `/reload`. `/clarity status` should then be unavailable.

## Troubleshooting

- **`/clarity` is unavailable:** run `/reload`, then check `pi list` and `pi config` to confirm the package and extension resource are enabled.
- **The output looks over-constrained or repetitive:** remove overlapping readability rules from global or project `APPEND_SYSTEM.md` files, then run `/reload`.
- **The wrong contract is shown:** run `/clarity status` and confirm the exact model id. Unknown ids intentionally fall back to `balanced`.
- **A prompt file cannot be loaded:** update or reinstall the package so `extensions/` and `prompts/` come from the same checkout.
- **You need to disable it temporarily:** use `/clarity off`; this affects only the current session.

## Evaluation repository

- `research/` — cited evaluation-method research
- `prompts/` — control and candidate append prompts
- `cases/` — bilingual evaluation cases and expected properties
- `src/` — evaluation runner, analysis code, and tests
- `results/` — raw and summarized runs
- `reports/` — decisions and final recommendation

The evaluated models are `cliproxy-codex/gpt-5.6-sol` and `cliproxy-claude/claude-opus-5`, in English and Spanish. Correctness and task completion remain regression gates for presentation improvements.
