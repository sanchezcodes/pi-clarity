# Evaluation rubric: readability without behavioral regression

This rubric evaluates an always-on Pi appended system prompt against a no-added-prompt control. It deliberately separates **whether the assistant did the job correctly** from **how well the response was presented**.

> **PROVISIONAL — RESEARCH RECONCILIATION REQUIRED**
>
> The scale, judging procedure, and acceptance thresholds below are initial operating criteria. They must be reconciled with the research agent's cited findings before the confirmatory evaluation. Record any changes prospectively; do not tune thresholds after unblinding final candidate results.

## 1. Evaluation order

Evaluate each trial in this order:

1. Run deterministic checks and inspect tool/workspace artifacts.
2. Apply the **Correctness** hard gate.
3. Apply the **Task completion** hard gate.
4. Only for responses that pass both gates, score the eight presentation dimensions.
5. Conduct the blinded pairwise comparison.

Presentation cannot compensate for a failed hard gate. Keep hard-gate pass rates separate from readability scores; do not combine them into a single average that can hide regressions.

## 2. Hard gates

Use `PASS`, `FAIL`, or `UNJUDGEABLE` for each gate. `UNJUDGEABLE` is not a pass and must be investigated; rerun only for a documented infrastructure failure, not because the model performed poorly.

### 2.1 Correctness — hard gate

**PASS** when the response's material claims, reasoning, code, and stated results are accurate enough for the requested use, including every correctness requirement listed for the case.

**FAIL** when any of the following applies:

- A material factual or technical claim is false or seriously misleading.
- The response reaches an incorrect conclusion or recommends an unsafe/inapplicable action as though it were sound.
- Code fails required tests, violates an explicit behavioral constraint, or contains a material defect.
- The response claims a tool action, validation, file state, or test result that did not occur.
- The assistant invents required facts instead of identifying blocking uncertainty.
- Omissions make the answer materially wrong for the stated task, even if included statements are individually true.

Minor wording imprecision that cannot change interpretation may be noted without failing the gate. When uncertain, judges should identify the exact disputed claim and seek adjudication rather than using readability as a proxy for correctness.

### 2.2 Task completion — hard gate

**PASS** when the assistant carries out the user's requested task and obeys all material constraints, including requested actions, audience, language, format limits, file scope, validation, and multi-turn changes of direction.

**FAIL** when any of the following applies:

- The response answers a different question, provides instructions instead of performing an available requested action, or stops before a required deliverable.
- A material requested section, comparison dimension, artifact, edit, test, validation, or follow-up constraint is missing.
- The assistant makes unauthorized edits, creates forbidden files, or ignores a stated scope boundary.
- The assistant should ask a blocking clarification but guesses instead.
- The response violates an explicit length, language, code/no-code, or representation constraint.
- A follow-up asks for a re-pitch but the assistant merely repeats or lightly trims the earlier answer without adapting it.

Optional enrichment does not count as completion if the core request remains unfinished.

## 3. Scored presentation dimensions

Score each dimension from **1 to 5** for responses that pass both gates. Use whole numbers. A score of 3 means competent/acceptable—not poor. Judges must cite brief response evidence for scores of 1, 2, or 5.

### 3.1 Comprehension

How easily can the intended reader build an accurate mental model from the response?

| Score | Anchor |
|---|---|
| 1 | Very difficult to understand; relationships or reasoning are obscured, and rereading may not resolve them. |
| 2 | Understandable only with substantial effort; important connections are implicit or confusing. |
| 3 | Generally clear to the stated audience, with occasional friction or dense passages. |
| 4 | Clear on first careful read; explanations and examples support an accurate mental model. |
| 5 | Exceptionally easy for the stated audience to understand without sacrificing substance; complex relationships become noticeably clearer. |

### 3.2 Information hierarchy

Does the response put the most important material first and organize supporting detail according to the task?

| Score | Anchor |
|---|---|
| 1 | No usable hierarchy; key answer is buried or organization is misleading. |
| 2 | Some structure exists, but priorities are hard to identify or sections are poorly ordered. |
| 3 | Main answer and supporting details are reasonably ordered. |
| 4 | Priorities are immediately apparent and detail unfolds in a helpful sequence. |
| 5 | Organization precisely matches the reader's decision or learning path; emphasis is exceptionally well calibrated. |

### 3.3 Terminology

Are technical terms accurate, consistent, and appropriate for the stated audience?

| Score | Anchor |
|---|---|
| 1 | Unexplained or misused terminology materially blocks understanding. |
| 2 | Frequent avoidable jargon, inconsistent labels, or definitions that arrive too late. |
| 3 | Terminology is mostly appropriate; specialized terms are generally understandable. |
| 4 | Terms are accurate, consistently used, and defined or contextualized when needed. |
| 5 | Terminology is exceptionally precise and audience-calibrated; definitions clarify without talking down to the reader. |

Do not reward replacing precise technical terms with vague everyday language when precision is needed. In Spanish, natural Spanish technical usage or commonly accepted English loanwords may both be appropriate depending on audience and context.

### 3.4 Appropriate depth

Does the response provide the amount and level of detail requested—neither shallow nor needlessly exhaustive?

| Score | Anchor |
|---|---|
| 1 | Grossly mismatched depth: a shallow answer to a depth request or an overwhelming essay for a simple task. |
| 2 | Important detail is missing, or excess detail substantially impedes the task. |
| 3 | Adequate depth with minor under- or over-explanation. |
| 4 | Detail is well matched to the request, audience, and consequences of the task. |
| 5 | Depth is exceptionally calibrated: concise where possible, thorough where necessary, with useful progressive disclosure. |

Length alone is not evidence of depth. The long-form cases should not be penalized merely for being long, and brief cases should not be expanded merely to display structure.

### 3.5 Representation choice

Does the assistant choose an effective form—prose, bullets, table, code, equations, or diagram—for the information and task?

| Score | Anchor |
|---|---|
| 1 | Representation is actively unsuitable or violates the request; it obscures the content. |
| 2 | Format adds friction, such as a needless table, decorative diagram, or dense prose for a branching flow. |
| 3 | Representation is serviceable but not notably helpful. |
| 4 | Form fits the content and materially aids comparison, sequence, implementation, or understanding. |
| 5 | Representation is exceptionally well chosen and integrated; another common format would be meaningfully less effective. |

A diagram is not inherently better than prose. Reward it when spatial relationships, sequence, or branching warrant it; penalize it when it adds ceremony to a short rewrite or direct answer.

### 3.6 Scannability

Can a reader locate the answer, steps, decisions, caveats, or comparisons efficiently?

| Score | Anchor |
|---|---|
| 1 | Important content is difficult to locate even with careful reading. |
| 2 | Long blocks, weak labels, or fragmented structure make retrieval slow. |
| 3 | Reasonably navigable for its length and task. |
| 4 | Key material is easy to find; paragraphing and labels are helpful and restrained. |
| 5 | Exceptionally navigable with near-immediate access to both the main answer and needed detail. |

Do not equate scannability with many headings or bullets. Excessive fragmentation can reduce the score.

### 3.7 Non-intrusion

Does presentation assistance remain subordinate to the user's actual task and to normal agent behavior?

| Score | Anchor |
|---|---|
| 1 | Presentation behavior obstructs task execution, ignores tools, changes requested output, or dominates the response. |
| 2 | Noticeable ceremony, meta-commentary, templating, or formatting distracts from the task. |
| 3 | Presentation is mostly unobtrusive, with minor unnecessary framing. |
| 4 | Readability support is quiet and well integrated; the response feels natural for the task. |
| 5 | Presentation is effectively invisible as a separate behavior: the response simply fits the user's need, tools, and context exceptionally well. |

Look specifically for unsolicited summaries, mandatory-looking section templates, “here is a clearer version” meta-talk, overuse of diagrams, and explanatory prose inserted where the user asked for direct edits or code.

### 3.8 Repetition

Does each part add value without restating the same content?

| Score | Anchor |
|---|---|
| 1 | Extensive repetition substantially bloats or obscures the answer. |
| 2 | Multiple points are restated in introductions, bodies, summaries, or parallel formats with little added value. |
| 3 | Mostly nonrepetitive, with a small amount of harmless restatement. |
| 4 | Concise and cumulative; recaps are used only when they aid a long answer. |
| 5 | Every section advances the task; any repetition is strategically necessary for comprehension or action. |

A useful final synthesis in a long answer is not automatically repetition. A summary that merely duplicates a short answer is.

## 4. Derived scores

For gate-passing responses, calculate:

- **Presentation mean:** unweighted mean of the eight dimension scores.
- **Comprehension core:** mean of comprehension, information hierarchy, terminology, and appropriate depth.
- **Restraint core:** mean of representation choice, scannability, non-intrusion, and repetition.

Report all dimension distributions as well as means. The derived scores support analysis but do not replace the pairwise preference or hard gates. Do not assign presentation scores to failed responses in the primary analysis; if diagnostic scores are collected, label and analyze them separately.

## 5. Blind pairwise judging

### 5.1 Pair construction

- Compare outputs from the same case, language, model/provider, tool environment, and matched repetition block.
- The primary comparison is each candidate against the no-added-prompt control. Candidate-versus-candidate comparisons may be added for finalists.
- Generate opaque output IDs unrelated to prompt-variant names.
- Randomize which output appears as A or B independently for every judgment.
- Remove prompt-variant identity, system-prompt text, model identity when models are not the comparison target, timestamps, filenames that encode variants, and other provenance clues.
- Preserve the user prompt, conversational context, response content, code formatting, and meaningful tool/action transcript. For tool cases, give judges a neutral artifact report (diff, validation result, and unauthorized-file check) generated by the harness.
- Do not “clean up” one output differently from the other. Blind packaging must be deterministic and reproducible.

### 5.2 Judge sequence

For each A/B pair, the judge should:

1. Read the case prompt and case-specific expectations.
2. Assess Correctness and Task completion independently for A and B.
3. If exactly one response passes both gates, select that response as the overall winner and record the failed gate(s). Readability cannot reverse this result.
4. If neither response passes both gates, select `NEITHER — BOTH FAIL GATES`; optionally record which is closer for diagnosis, but exclude that diagnostic preference from the primary readability win rate.
5. If both pass, score all eight presentation dimensions for each response.
6. Choose one overall readability result:
   - `A clearly better`
   - `A slightly better`
   - `Tie / no meaningful difference`
   - `B slightly better`
   - `B clearly better`
7. Record confidence (`low`, `medium`, or `high`) and a short evidence-based rationale.
8. Flag suspected identity leakage, broken formatting, missing context, or judge uncertainty.

The overall readability choice should reflect fitness for this particular user and task, not the amount of visible formatting.

### 5.3 Judge assignment and agreement

- Use at least two independent judgments per pair in exploratory evaluation and preferably three for confirmatory evaluation.
- Judges must not discuss a pair before submitting their initial judgment.
- Resolve gate disagreement through adjudication by a technically qualified judge with access to deterministic evidence.
- Report raw agreement and an agreement statistic suitable for the number of judges/categories chosen during research reconciliation.
- Keep original judgments even after adjudication so the process remains auditable.
- Include attention/calibration examples unrelated to candidate wording, and periodically check for side bias or systematic preference for longer responses.

### 5.4 Pairwise metrics

Report at least:

- gate-pass counts and rates for each variant;
- clear wins, slight wins, ties, losses, and both-fail pairs;
- **tie-adjusted win rate** among both-pass pairs, where each win counts 1, each tie 0.5, and each loss 0;
- results by language, category, model, and case;
- dimension deltas with uncertainty intervals;
- judge agreement and adjudication rate.

Never silently discard failed runs. Infrastructure failures, refusals, empty outputs, and tool errors need explicit categories.

## 6. Provisional acceptance thresholds

> **PROVISIONAL — TO BE RECONCILED WITH THE RESEARCH AGENT BEFORE CONFIRMATORY TESTING**
>
> These thresholds are decision rules for planning, not established empirical standards. Confidence-interval method, minimum sample size, multiple-comparison treatment, and agreement statistic remain open until research reconciliation.

A candidate is provisionally acceptable only if **all** conditions below hold against the no-added-prompt control.

### 6.1 Hard-gate conditions

1. **No material correctness regression:** pooled correctness pass rate is not lower than control by more than 2 percentage points, and there is no recurring candidate-specific factual or technical failure pattern.
2. **No material task-completion regression:** pooled completion pass rate is not lower than control by more than 2 percentage points.
3. **No protected-slice regression:** neither language, tool-using cases, coding/debugging cases, nor long-form cases may show a pass-rate drop greater than 5 percentage points.
4. **No severe new failure:** zero candidate-specific catastrophic failures involving fabricated tool execution, unsafe destructive action, corruption outside requested scope, or confidently wrong high-impact guidance.
5. **Uncertainty requirement:** for the final decision, the chosen confidence interval for each pooled gate-rate difference must exclude a degradation worse than 5 percentage points.

A gate condition overrides all readability gains.

### 6.2 Readability conditions

Among pairs where both outputs pass both gates:

1. **Pairwise preference:** tie-adjusted win rate is at least 0.60 overall, with the lower bound of the chosen 95% interval above 0.50.
2. **Bilingual evidence:** tie-adjusted win rate is at least 0.55 in both English and Spanish; neither language may rely solely on the aggregate result.
3. **Mean improvement:** presentation mean improves by at least 0.25 points on the 1–5 scale overall.
4. **Core comprehension:** comprehension core improves by at least 0.20 points overall.
5. **No dimension trade-away:** no individual dimension declines by more than 0.10 points overall or 0.20 points in either language.
6. **Behavioral restraint:** non-intrusion and repetition each score no worse than control overall, and simple-answer plus diagram-not-useful cases show no recurring over-formatting pattern.
7. **Depth preservation:** appropriate-depth scores for long-form and architecture cases show no decline greater than 0.10 points, with qualitative confirmation that requested substance was retained.

### 6.3 Operational guardrails

Readability should not be purchased through uncontrolled output growth or slower normal operation. Provisionally:

- median output tokens should not increase by more than 10% overall;
- median output tokens for brief/rewrite cases should not increase by more than 15%;
- median end-to-end latency should not increase by more than 10%, excluding documented provider noise and tool time outside the model's control;
- tool-call count should not increase without a task-relevant reason.

These are guardrails, not substitutes for human judgment. Report distributions and outliers rather than only medians.

## 7. Decision categories

- **Accept for broader testing:** all hard-gate, readability, and operational conditions pass.
- **Revise and rerun:** no severe hard-gate failure, but one or more readability/guardrail thresholds miss or a localized regression has a plausible prompt-level fix.
- **Reject:** any severe new failure, material correctness/task-completion regression, or readability gain that depends on sacrificing a protected slice.
- **Inconclusive:** sample size, judge agreement, or infrastructure quality is insufficient for the provisional statistical rules.

Final reports must show failures and slice-level results even when the aggregate decision is positive.

## 8. Reconciliation checklist for the research agent

Before freezing the confirmatory rubric, reconcile and document:

- appropriate paired-comparison statistics and confidence intervals for repeated stochastic trials;
- minimum repetitions, judges per pair, and power expectations;
- tie handling and whether clear/slight preferences should receive different weights;
- inter-rater reliability statistic and acceptable agreement level;
- evidence for scale construction and whether dimension weights should remain equal;
- practical non-inferiority margins for correctness, completion, latency, and token usage;
- treatment of multiple models, languages, cases, and multiple candidate prompts;
- judge calibration, ordering bias, verbosity bias, and identity leakage controls;
- whether any thresholds should differ for exploratory selection versus final confirmation.

Mark the reconciled version with a new rubric version/date and cite the primary research sources that justify changes.
