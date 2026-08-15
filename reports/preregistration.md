# Preregistration — exploratory evaluation of Pi presentation prompts

- **Version:** 1.0 (exploratory)
- **Status:** FROZEN. Written and committed before any model output was inspected.
- **Supersedes:** the `PROVISIONAL` sections of `research/rubric.md` §6 for the exploratory stage only.
- **Reconciles:** `research/rubric.md` (rubric §8 reconciliation checklist) with
  `research/evaluation-methods.md` (§4, §8.1–§8.7).
- **Change control:** any change to the bars, judge prompt, pairing rule, or acceptance
  logic requires a new dated version in this file, committed before further judging. Bars
  are never edited after results are unblinded.

This project is practical, not NASA-grade. The plan below deliberately buys decision
speed with statistical modesty, and states where it does so.

---

## 1. What is being decided

Which, if any, of the appended presentation prompts (`minimal`, `balanced`, `strong`)
should advance to confirmatory testing against the no-added-prompt `control`, on both
`cliproxy-codex/gpt-5.6-sol` and `cliproxy-claude/claude-opus-5`, in English and Spanish.

Exploratory output is a **ranking plus a shortlist**, not a certified effect size.

---

## 2. Reconciliation: rubric vs. research

| Question | `research/rubric.md` (provisional) | `research/evaluation-methods.md` | Frozen exploratory decision |
|---|---|---|---|
| Repetitions | not specified | 5 per cell (§8.1), to shrink within-case variance | **2** for the full matrix, **3rd repetition for `control` + finalists only**. Repetitions are variance reduction, not sample size. |
| Sample size `n` | not specified | cases are the unit; 24 cases, cluster by `pair_id` (§4) | Unit of analysis is the **case × model** cell; repetitions averaged within a cell first. Reported `n` never counts repetitions. |
| Statistics | 95% CI, method open (§6) | CLT + SEM, paired differences, clustered SE (§4) | Report counts, medians, tie-adjusted win rate, and a **Wilson interval** on order-consistent pairs. No clustered-SE model at this stage; treated as descriptive. |
| Judges per pair | ≥2 exploratory, 3 confirmatory (§5.3) | cross-model judging, both orders (§8.4) | **One cross-model judge, run in both A/B orders.** Order consistency replaces multi-judge agreement in exploratory. Multi-judge agreement (and a kappa) deferred to confirmatory. |
| Judge assignment | model identity hidden (§5.1) | never self-judge (§8.4) | `gpt-5.6-sol` outputs judged by `cliproxy-claude/claude-opus-5`; `claude-opus-5` outputs judged by `cliproxy-codex/gpt-5.6-sol`. Both outputs in a pair always come from the same generating model. |
| Position bias | randomize A/B (§5.1) | randomize **and** run both orders, count only order-consistent preferences (§8.4) | Adopt the stricter research rule. A/B slot for round 1 is a deterministic hash of the pair key; round 2 is its exact inverse. **Only direction-identical results count.** |
| Scoring surface | 8 dimensions, 1–5, plus a preference (§3, §5.2) | discrete output, reasoning discarded (§8.4) | Exploratory judging emits **gates + one 5-point preference label + confidence**, no per-dimension scores. Dimension scoring is expensive per call and is deferred to confirmatory. Deterministic metrics cover the mechanical part of §3. |
| Verbosity bias | noted (§3.4, §6.3) | record length delta per judgment, stratify win rate (§8.4) | Length delta recorded on every judgment and reported; win rate is reported alongside token deltas. |
| Deterministic metrics | implied by §3 | §8.3, per-language scales | Adopted in `src/metrics.ts`. English scored with Flesch Reading Ease / Flesch–Kincaid; Spanish with **INFLESZ** (Flesch–Szigriszt), bands Muy Difícil <40, Algo Difícil 40–55, Normal 55–65, Bastante Fácil 65–80, Muy Fácil >80. Identifiers, code, URLs, paths, and proper-name-shaped tokens are stripped first (WCAG 3.1.5). **Within-language deltas only; English and Spanish absolute scores are never compared.** |
| Gate regression margin | ≤2 pp pooled, ≤5 pp per slice (§6.1) | 95% CI excludes >2 pp drop, per model × language cell (§8.6) | Exploratory margins widened for a 2-repetition sample: **≤5 pp pooled, ≤10 pp per model × language cell**, sign-based, no CI requirement. The tight §8.6 rule is the confirmatory bar. |
| Readability bar | tie-adjusted ≥0.60 with CI LB >0.50 (§6.2) | order-consistent win rate CI LB >50% on both models (§8.6) | Exploratory shortlist bar: **tie-adjusted ≥0.55 pooled and ≥0.50 in each language and on each model**; Wilson lower bound reported but not gating. Stage B requires the lower bound to exceed 0.50 pooled. |
| Token/latency guardrails | +10% tokens, +10% latency (§6.3) | +15% median tokens, p95 latency within 10% (§8.6) | Exploratory: **median output tokens ≤ +20%**, **median wall time ≤ +20%**, distributions reported. Tighter bars return at confirmatory. |
| Judge calibration set | required before use (§5.3) | required, ordered triples (§8.4) | **Not run at exploratory stage.** Recorded as a limitation (§8). Required before confirmatory. |
| Machine paraphrase test | not in rubric | recommended (§8.4) | Deferred to confirmatory. |
| Held-out cases | not in rubric | reserve pairs (§8.7) | Not reserved at exploratory stage; all 12 scenario pairs are used. Recorded as a limitation. |
| Long-form depth | ≤0.10 dimension drop (§6.2.7) | median output tokens ≥90% of control (§8.2) | Deterministic form adopted: **long-form and architecture median output tokens ≥90% of control**, per model × language. |

---

## 3. Staged plan

### Stage 0 — smoke (complete)

`control` × `simple-answer-{en,es}` × both models × 1 repetition. Confirms harness,
provider access, usage capture, and result determinism. Not analyzed for acceptance.

### Stage A — exploratory full matrix, 2 repetitions

- 24 cases × 4 variants × 2 models × **2 repetitions = 384 runs**.
- Judging pairs each candidate run against the `control` run from the **same case, model,
  and repetition index** (matched repetition block, per rubric §5.1).
- Pairs available: 24 × 3 candidates × 2 models × 2 repetitions = **288 pairs**, judged in
  both orders = **576 judge calls**.
- Judging priority is repetition 1 first, then repetition 2, so a budget-capped run still
  yields a balanced matrix. Acceptance requires **≥80% coverage of repetition-1 pairs** in
  every model × language cell; below that the verdict is `inconclusive`.

### Stage B — finalists, 3rd repetition

- Finalists = candidates that pass all Stage A gate and guardrail bars, ranked by pooled
  tie-adjusted win rate; **at most 2 advance**.
- Run repetition 3 for `control` + finalists only: 24 × (1 + ≤2) × 2 × 1 = **≤144 runs**,
  ≤72 new pairs, ≤144 judge calls.
- Stage B analysis pools repetitions 1–3 for finalists and applies the Stage B bars.

Anything beyond Stage B (dimension scoring, second judge, calibration triples, paraphrase
probe, held-out pairs) is confirmatory work and is out of scope for this preregistration.

---

## 4. Frozen acceptance bars

Mirrored exactly by `EXPLORATORY_BARS` in `src/judge.ts`; the code is the executable copy
of this table.

### 4.1 Hard gates (blocking, both stages)

1. Candidate combined gate-pass rate (correctness **and** task completion) is not more
   than **5 pp** below control, pooled per model.
2. No model × language cell shows a drop greater than **10 pp**.
3. Zero candidate-specific catastrophic failures: fabricated tool execution, destructive
   action, edits outside requested scope, or confidently wrong high-impact guidance.
4. Language fidelity: Spanish cases answered in Spanish, deterministic check, **100%**.
5. Verbatim fidelity for code, commands, paths, and identifiers is checked deterministically
   and reported; any violation blocks the candidate.

A gate failure overrides every readability result.

### 4.2 Readability (order-consistent pairs where both outputs pass both gates)

| Bar | Stage A | Stage B |
|---|---|---|
| Tie-adjusted win rate, pooled | ≥ 0.55 | ≥ 0.60 |
| Tie-adjusted win rate, each language | ≥ 0.50 | ≥ 0.55 |
| Tie-adjusted win rate, each model | ≥ 0.50 | ≥ 0.55 |
| Wilson 95% lower bound, pooled | reported | > 0.50 |
| Order-consistency rate | ≥ 0.60 | ≥ 0.60 |
| Decisive order-consistent pairs, pooled | ≥ 30 | ≥ 45 |

Wins, ties, and losses are counted from the candidate's perspective. Tie-adjusted win
rate = (wins + 0.5 × ties) / (wins + ties + losses). `clearly better` and `slightly
better` are weighted equally at exploratory stage.

### 4.3 Operational guardrails

- Median output tokens ≤ **+20%** vs. control, pooled per model.
- Median output tokens for `simple_answer` and `representation_choice` cases ≤ **+25%**.
- Median wall time ≤ **+20%** vs. control, pooled per model; distributions reported.
- Long-form and architecture median output tokens ≥ **90%** of control.

### 4.4 Decision categories

- **Advance** — all gate, readability, and guardrail bars pass.
- **Revise** — gates pass, one readability or guardrail bar misses.
- **Reject** — any gate failure or catastrophic failure.
- **Inconclusive** — coverage or decisive-pair minimums unmet.

Ties in ranking resolve toward the **smaller prompt**, per the repository's stated
preference for the smallest prompt that produces a reliable improvement.

---

## 5. Judging protocol

1. Pair construction: same case, language, model, provider, and repetition index;
   candidate vs. `control` only. Candidate-vs-candidate is out of scope.
2. Blinding: opaque output IDs derived from a hash of run ID and pair key; variant names,
   prompt text, filenames, timestamps, and run IDs never appear in the judge prompt.
3. Order: round 1 slot assignment is `sha256(pairKey)` parity; round 2 is its inverse.
   Both rounds use the same judge model and judge prompt version.
4. Cross-judging as in §2. The judge is never told which model produced the outputs.
5. Judge sequence: correctness gate, then task-completion gate, for each output
   independently; readability preference is requested **only** when both outputs pass both
   gates, and cannot reverse a gate result.
6. Output: one JSON object with per-output gate verdicts, a 5-point readability label,
   confidence, a short rationale, and flags. Rationale is stored for audit, not scored.
7. Persistence: one JSON judgment per pair per order under `results/judgments/`, named by a
   deterministic judgment ID over `{promptVersion, pairKey, round, judgeModel}`. Re-running
   skips existing files, so judging resumes deterministically and never double-charges.
8. Budget: `--max-calls` caps pending judge invocations; `--dry-run` prints the plan.

---

## 6. Analysis outputs

`npm run analyze` reports, per model / language / variant:

- gate pass rates (correctness, completion, combined) with unjudgeable counts;
- order-consistent wins / ties / losses, inconsistent count, order-consistency rate,
  tie-adjusted win rate, Wilson interval;
- both-fail and candidate-only-fail pair counts;
- median and p90 output tokens and wall time, and percentage deltas vs. control;
- within-language deterministic presentation deltas (readability score, sentence length,
  heading count, list share, answer-first rate, acronym gloss rate);
- acceptance status per candidate against the Stage A or Stage B bars, with the specific
  failing bar named.

Failed, empty, timed-out, and unjudgeable runs are reported as explicit categories and
never silently dropped.

---

## 7. What is intentionally not done

- No per-dimension 1–5 scoring at exploratory stage.
- No second judge, no adjudication workflow, no inter-rater statistic.
- No judge calibration triples, no human spot-check sample, no paraphrase probe.
- No clustered standard errors or power analysis in the report generator.
- No held-out scenario pairs.

Each is a confirmatory-stage requirement recorded in `research/rubric.md` §8 and
`research/evaluation-methods.md` §8.4/§8.7.

---

## 8. Known limitations

1. **Multi-turn cases are provisional.** `repitch-follow-up-{en,es}` are delivered as one
   structured prompt containing all user turns, because Pi's JSON mode is one-shot. That
   preserves turn text but is not a real conversation, so the rubric's "re-pitch adapts the
   earlier answer" gate is weaker than intended. These two cases are reported separately
   and excluded from any pooled result used for a reject decision.
2. **Tool cases lack a neutral artifact report.** `tool-use-{en,es}` are judged from the
   response text plus a workspace file-change listing. Rubric §5.1's full diff/validation/
   unauthorized-file report is not implemented.
3. **Power.** 24 cases support roughly a 0.57 SD effect at 80% power, ~0.81 SD per
   language (`research/evaluation-methods.md` §4). Stage A cannot certify a subtle effect;
   it can only shortlist.
4. **Uncalibrated judge.** Judge ordering ability is unverified; order consistency is a
   weaker control than a calibration set.
5. **Prompt-level grader hacking is unmitigated** without held-out pairs and human
   spot-checks; a Stage B winner is a candidate for confirmatory testing, not a decision.
6. **Readability formulas are heuristic.** Syllable counting is rule-based for both
   languages, so absolute scores carry error; only within-language deltas are interpreted.
7. **Provider noise is uncontrolled.** Latency is wall-clock around a subprocess and
   includes provider queueing; treat latency bars as guardrails, not measurements.
