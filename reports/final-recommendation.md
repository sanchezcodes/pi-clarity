# Final recommendation

## Decision

No single appended prompt passed every exploratory gate on both models and both languages.

Use a **model-aware response contract**:

- `gpt-5.6-sol` → [`prompts/strong.md`](../prompts/strong.md)
- `claude-opus-5` → [`prompts/balanced.md`](../prompts/balanced.md)

If a single global `APPEND_SYSTEM.md` is required, use `prompts/balanced.md`. It is the safest compromise, but the evaluation did not show an English clarity improvement on GPT.

Do not use `prompts/minimal.md` or `prompts/refined.md` globally. Do not use `prompts/strong.md` globally while Opus Spanish is in scope.

## Evidence collected

The evaluation stopped when subscription limits approached exhaustion.

- 24 bilingual cases: 12 English and 12 Spanish.
- 2 generating models.
- Stage A: 384 responses, covering control/minimal/balanced/strong with two repetitions.
- Iterative round: 192 additional responses, covering control/refined with three repetitions.
- 576 complete Stage A blind judge calls.
- 154 additional scoped-flag judge calls for the refined candidate before the run was stopped.
- No generation or judge process failed or produced an unparseable result.

Raw outputs and judgments remain local under `results/`, which is intentionally not committed. Reproducible prompts, cases, research, code, preregistrations, and this decision are committed.

## Stage A preference signal

Tie-adjusted clarity preference against control, using only pairs whose two A/B-order judgments agreed:

| Candidate | Pooled | GPT | Opus | English | Spanish |
|---|---:|---:|---:|---:|---:|
| Minimal | 0.558 | 0.554 | 0.567 | 0.563 | 0.553 |
| Balanced | 0.622 | 0.625 | 0.615 | 0.469 | 0.738 |
| Strong | **0.678** | **0.677** | **0.679** | **0.674** | **0.682** |

Model × language detail:

| Candidate | GPT English | GPT Spanish | Opus English | Opus Spanish |
|---|---:|---:|---:|---:|
| Minimal | 0.531 | 0.583 | 0.625 | 0.500 |
| Balanced | 0.455 | 0.769 | 0.500 | 0.688 |
| Strong | **0.600** | **0.750** | **0.813** | 0.500 |

Strong was the clearest prompt overall. It also showed a correctness/completion regression on Opus Spanish and shortened GPT Spanish long-form/architecture outputs below the preregistered depth floor. That prevents global adoption.

Balanced showed no material gate regression and stayed within operational guardrails. It helped Spanish substantially, but did not improve English. This makes it the safer Opus choice and the least-risky single global fallback.

Minimal was close to neutral but shortened long-form depth on Opus English, Opus Spanish, and GPT Spanish. Its small context cost did not justify that regression.

## Refined-candidate result

The refined candidate added an explicit epistemic-integrity rule and removed rigid sentence/paragraph thresholds. Judging was stopped partway through to protect subscription quota.

Partial order-consistent clarity preference:

- Opus: 0.875, based on 8 decisive pairs.
- GPT: 0.421, based on 19 decisive pairs.
- English: 0.417.
- Spanish: 0.667.
- Pooled: 0.556.

It was therefore not a viable universal replacement. It appeared promising for Opus, but the available Opus sample still showed Spanish gate concerns and was too small for selection over balanced.

## Operational impact

None of the Stage A candidates caused a systematic median latency increase. Output effects depended on model and language rather than prompt length alone.

Strong remained within the general output-token guardrail, but the protected long-form GPT Spanish slice retained only 76.1% of control output tokens. Balanced stayed within the depth and overall operational guards.

## Why model-aware steering is justified

The same wording produced materially different outcomes by model and language:

```text
                     GPT                     Opus
English        strong improved         strong improved
Spanish        strong improved         balanced safer
```

A single static global append necessarily accepts one of two avoidable compromises:

- `strong`: better clarity, unsafe Opus Spanish regression.
- `balanced`: safer behavior, no measured GPT English benefit.

A Pi extension can select the prompt from the active model inside `before_agent_start`. This remains always-on and requires no skill invocation or manual redo.

## Limitations

- This is an exploratory evaluation, not a certified statistical result.
- Cases were reused while designing the refined prompt; that round has overfitting risk.
- LLM judges showed substantial gate disagreement, especially when GPT judged Opus outputs.
- The multi-turn re-pitch cases were encoded as structured one-shot prompts, not true interactive sessions.
- The first judge schema had unscoped flags. The bug was corrected prospectively; legacy flags are audit-only.
- Human comprehension review by the intended reader remains the final acceptance test.

## Recommended next action

Build a small global Pi extension that:

1. Appends `prompts/strong.md` for `gpt-5.6-sol`.
2. Appends `prompts/balanced.md` for `claude-opus-5`.
3. Uses `balanced` as the fallback for unknown models.
4. Provides a command to disable or inspect the active contract.
5. Does not post-process completed responses or make additional model calls.

Install it only after reviewing the two prompt files and a small sample of saved responses.
