# pi-clarify

Evaluate small, always-on response-presentation prompts for Pi across models and languages.

## Goal

Find an appended system prompt that improves comprehension and layout without degrading correctness, task completion, tool use, long-form depth, latency, or output efficiency.

## Models

- `cliproxy-codex/gpt-5.6-sol`
- `cliproxy-claude/claude-opus-5`

## Languages

- English
- Spanish

## Evaluation principles

- Compare every candidate with a no-added-prompt control.
- Run repeated trials to measure stochastic variation.
- Use deterministic checks where possible and blind pairwise judging elsewhere.
- Treat correctness and task completion as regression gates.
- Keep raw responses and derived scores reproducible.
- Prefer the smallest prompt that produces a reliable improvement.

## Repository layout

- `research/` — cited evaluation-method research
- `prompts/` — control and candidate append prompts
- `cases/` — bilingual evaluation cases and expected properties
- `src/` — evaluation runner and analysis code
- `results/` — raw and summarized runs
- `reports/` — decisions and final recommendation
