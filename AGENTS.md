# Project instructions

This repository evaluates response-presentation prompts for Pi.

## Quality gates

- Preserve raw model outputs; derived analysis must be reproducible.
- Record model, provider, prompt variant, case, language, repetition, timing, and token usage when available.
- Keep evaluation cases independent from candidate prompt wording.
- Blind prompt-variant identities during qualitative judging.
- Correctness and task completion are hard gates, not dimensions that readability can compensate for.
- Cite primary sources in research notes.
- Follow `docs/data-handling.md` for every fixture, trace, model output, log, screenshot, or imported dataset.
- Use synthetic public-safe data by default; never copy data from a private workspace merely because it is available locally.
- Never commit credentials, Pi session files, raw private conversations, production traces, personal information, or local absolute home paths.
- Before committing, inspect `git diff --cached` and run `npm run check`. Treat automated scanners as defense in depth, not proof that data is safe.

## Collaboration

Background agents should modify only the files assigned in their prompt. Commit completed work with a focused commit message and push to `origin/main`. Pull before editing if another agent may have pushed.
