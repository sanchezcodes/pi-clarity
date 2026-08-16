# Evaluation methods for pi-clarity

Research notes on how to measure whether an always-on, appended response-presentation
prompt improves comprehension without regressing correctness, depth, latency, or cost.
Every substantive claim is cited to a primary source. The last section turns the research
into a concrete plan for this repository's 24-case bilingual suite.

---

## 1. Start from success criteria, not from scores

Anthropic's evaluation guidance frames the whole cycle as: define measurable success
criteria first, then build evals that measure against them, then iterate on the prompt.
Criteria should be **specific, measurable, achievable, and relevant**; the guidance
explicitly contrasts a bad criterion ("the model should classify sentiments well") with a
good one that names the metric, the threshold, the dataset, and the baseline delta
("an F1 score of at least 0.85 on a held-out test set of 10,000 diverse Twitter posts,
which is a 5% improvement over the current baseline").
Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

The same page lists common success criteria that map almost one-to-one onto this project's
concerns: **task fidelity, consistency, relevance and coherence, tone and style, context
utilization, latency, and price**, and notes that "most use cases need multidimensional
evaluation along several success criteria."
Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

Its three eval design principles are directly applicable here:

1. **Be task-specific** — mirror the real task distribution, including edge cases
   (irrelevant input, overly long input, ambiguous cases "where even humans would find it
   hard to reach an assessment consensus").
2. **Automate when possible** — structure questions so grading can be code- or LLM-graded.
3. **Prioritize volume over quality** — "more questions with slightly lower signal
   automated grading is better than fewer questions with high-quality human hand-graded
   evals."

Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

OpenAI's eval guide describes the same loop in three steps — describe the task as an eval,
run it with test inputs, analyze and iterate — and compares it to behavior-driven
development, "where you begin by specifying how the system should behave before
implementing and testing the system."
Source: <https://platform.openai.com/docs/guides/evals>

**Implication for us.** `cases/evaluation-cases.json` already encodes this split:
`hard_gate_expectations` are the task-fidelity criteria, `presentation_observations` are
the style criteria. Keep them separate in scoring. Do not average them into one number.

---

## 2. Grading ladder: code first, LLM second, humans last

Anthropic's guidance ranks grading methods by speed, reliability, and scalability:

1. **Code-based grading** — "fastest and most reliable, extremely scalable, but also lacks
   nuance for more complex judgments" (exact match, string match).
2. **Human grading** — "most flexible and high quality, but slow and expensive. Avoid if
   possible."
3. **LLM-based grading** — "fast and flexible, scalable and suitable for complex judgment.
   Test to ensure reliability first then scale."

Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

OpenAI's graders reference documents the same tiers as concrete grader types: string check
graders, text similarity graders, Python graders (arbitrary code returning a float), model
graders, and combined graders that compose several sub-graders into one weighted score.
Source: <https://platform.openai.com/docs/guides/graders>

**Implication for us.** Presentation properties are largely computable and should not be
handed to a judge model. Sentence and paragraph length, heading count and depth, list
density, code-fence integrity, verbatim preservation of identifiers and paths, and the
presence of a leading answer sentence are all deterministic checks. Reserve the judge for
what code genuinely cannot see: whether the response actually reads more clearly, and
whether depth was preserved.

---

## 3. LLM-as-judge: what it is good for and where it breaks

### 3.1 Documented failure modes

The MT-Bench / Chatbot Arena work is the primary systematic study of LLM judges. It
identifies **position bias, verbosity bias, and self-enhancement bias, as well as limited
reasoning ability**, and reports that strong judges such as GPT-4 reach "over 80% agreement"
with human preferences — "the same level of agreement between humans."
Source: <https://arxiv.org/abs/2306.05685>

This matters more than usual for pi-clarity, because two of the named biases point in the
same direction as the intervention under test:

- **Verbosity bias** — a judge may reward the longer, more structured response for its
  length and headings rather than for its clarity. A presentation prompt that adds
  scaffolding will therefore get a systematic tailwind unless verbosity is controlled.
- **Position bias** — the candidate must not always be presented in slot A.

### 3.2 Self-grading and grader hacking

Anthropic's eval examples repeat the note that it is "generally best practice to use a
different model to evaluate than the model used to generate the evaluated output."
Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

OpenAI names the related failure explicitly: **grader hacking** — "models being trained
sometimes learn to exploit weaknesses in model graders." The stated detection method is to
compare "the model's performance across model grader evals and expert human evals": a
system that has hacked the grader "will score highly on model grader evals but score poorly
on expert human evaluations."
Source: <https://platform.openai.com/docs/guides/graders>

Although we are not training a model, we *are* selecting a prompt against a judge, which is
the same optimization pressure at a coarser granularity. Prompt selection driven purely by
an LLM judge will drift toward whatever the judge over-rewards.

### 3.3 Making judges usable

Anthropic's three tips for LLM-based grading:

- **Detailed, clear rubrics**, with automatic-fail conditions stated as rules.
- **Empirical or specific outputs** — "instruct the LLM to output only 'correct' or
  'incorrect', or to judge from a scale of 1–5. Purely qualitative evaluations are hard to
  assess quickly and at scale."
- **Encourage reasoning** — "ask the LLM to reason first before producing an evaluation
  score, and then discard the reasoning. This increases evaluation performance,
  particularly for tasks requiring complex judgment."

Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

OpenAI's grader design tips add:

- **"Produce a smooth score, not a pass/fail stamp"** — a graded score "shifts gradually as
  answers improve" and shows which changes matter.
- **"Guard against reward hacking."**
- **"Avoid skewed data"** — imbalanced label distributions invite the grader to guess.
- **"Use an LLM-as-a-judge when code falls short"** — and when doing so, "run multiple
  candidate responses and ground truths through your LLM judge to ensure grading is stable
  and aligned with preference. Provide few-shot examples of great, fair, and poor answers
  in the prompt."

Source: <https://platform.openai.com/docs/guides/graders>

OpenAI also prescribes how to validate a judge before trusting it: build a *model grader
eval* from task prompts, answers of known relative quality, and ground-truth grades, then
confirm the judge preserves the known ordering — if experts say
`answer_1 > answer_2 > answer_3`, verify
`model_grader(answer_1) > model_grader(answer_2) > model_grader(answer_3)`.
Source: <https://platform.openai.com/docs/guides/graders>

**Implication for us.** Before any candidate prompt is judged, the judge must pass a
calibration set of hand-ordered response triples. A judge that cannot reproduce a known
ordering cannot adjudicate a subtle presentation delta.

---

## 4. Repeated trials and statistics

Anthropic's statistical guidance for evals ("Adding Error Bars to Evals") is the most
directly load-bearing source for this project's run design.
Sources: <https://www.anthropic.com/research/statistical-approach-to-model-evals>,
<https://arxiv.org/abs/2411.00640>

Its five recommendations:

1. **Use the Central Limit Theorem.** Treat eval questions as drawn from an unseen
   "question universe"; the object of interest is the theoretical mean, not the observed
   average. Report the **standard error of the mean (SEM)** alongside every score; a 95%
   confidence interval is the mean ± 1.96 × SEM.
2. **Cluster standard errors.** When questions come in related groups, naive independence
   assumptions "will lead us to underestimate the standard error."
3. **Reduce variance within questions.** Decompose each question's score into a mean score
   and a random component. For chain-of-thought / free-form generation, "resample answers
   from the same model several times, and use the question-level averages as the question
   scores fed into the Central Limit Theorem."
4. **Analyze paired differences.** "Since the question list is shared across models,
   conducting a paired-differences test lets us eliminate the variance in question
   difficulty and focus on the variance in responses." Question-score correlations between
   frontier models are reported as "substantial — between 0.3 and 0.7," making pairing "a
   'free' variance reduction technique that is very well suited for AI model evals." The
   recommendation is to report "mean differences, standard errors, confidence intervals,
   and correlations" whenever comparing.
5. **Use power analysis.** Relate observation count, power, false positive rate, and effect
   size, and use it to choose both the number of questions and "the number of times to
   re-sample answers from questions."

Source: <https://www.anthropic.com/research/statistical-approach-to-model-evals>

Two consequences are easy to get wrong and worth stating plainly:

- **Repetitions do not increase `n`.** Under recommendation #3, repetitions shrink the
  within-case random component; the sample size entering the CLT remains the *number of
  cases*. Reporting 24 cases × 5 repetitions as `n = 120` inflates confidence.
- **Pairing is where the sensitivity comes from.** Comparing candidate vs. control on the
  same case, same model, and same language removes case-difficulty variance, which is by
  far the largest variance component in a heterogeneous 24-case suite.

### Power for this suite

With 24 paired case-level differences, a two-sided paired test at α = 0.05 with 80% power
detects a standardized effect of roughly
`(1.96 + 0.84) / sqrt(24) ≈ 0.57` standard deviations. Analyzed per language (12 pairs),
that degrades to about `0.81` standard deviations. This suite can detect a clear
presentation improvement; it cannot certify a subtle one, and it should not be reported as
if it could.

For blind pairwise judging scored as a win rate against 50%, a one-sample proportion test at
α = 0.05 with 80% power needs roughly **85 decisive comparisons to detect a 65% win rate**,
**47 for 70%**, and **194 for 60%**. Ties inflate these: at 40% ties, detecting a 65% win
rate needs about **141 judged comparisons**. Judgments over repetitions of the same case are
clustered, so treat these as optimistic bounds and cluster the standard errors per
recommendation #2.

---

## 5. Regression gates

OpenAI's eval cookbook frames prompt iteration explicitly as regression detection: the
stated use case is "I have an LLM integration ... I want to detect if a prompt change
regresses the behavior," with an eval holding the testing criteria and each run scored
against it.
Source: <https://developers.openai.com/cookbook/examples/evaluation/use-cases/regression>

An eval run returns per-criterion pass/fail counts (`per_testing_criteria_results`) and
totals (`result_counts` with `total`, `errored`, `failed`, `passed`), which is the shape a
gate should consume — per-criterion, not aggregate.
Source: <https://platform.openai.com/docs/guides/evals>

**Operational note.** OpenAI is deprecating the Evals platform: it becomes read-only for
existing users on **October 31, 2026** and is scheduled to shut down on **November 30, 2026**,
with Datasets as the recommended replacement.
Sources: <https://platform.openai.com/docs/guides/evals>,
<https://developers.openai.com/api/docs/guides/evaluation-getting-started>

That is a reason to keep our runner and scoring local and provider-neutral, as
`AGENTS.md` already requires, and to treat vendor eval platforms as optional reporting
surfaces rather than the system of record.

---

## 6. Readability, plain language, and controlled technical English

### 6.1 Reading level as an accessibility criterion

WCAG 2.2 Success Criterion **3.1.5 Reading Level (Level AAA)**: "When text requires reading
ability more advanced than the lower secondary education level after removal of proper names
and titles, supplemental content, or a version that does not require reading ability more
advanced than the lower secondary education level, is available."
Source: <https://www.w3.org/TR/WCAG22/#reading-level>

Two design points follow. First, the criterion is defined *after removing proper names and
titles* — so identifiers, product names, and file paths should be stripped before computing
any readability metric, or technical answers will be penalized for being about technical
things. Second, the criterion is satisfied by *supplemental content*, not only by
simplifying the primary text — which is the accessibility-standard analogue of "add a plain
summary, keep the depth."

### 6.2 Plain language

US federal plain-language guidance (successor home for PlainLanguage.gov content) states
that "content is easier to understand when you use language made up of, among other things,
shorter words, short sections, active voice, present tense," and that plain language "is
also the law" under the Plain Writing Act of 2010.
Sources: <https://digital.gov/guides/plain-language/writing>,
<https://digital.gov/guides/plain-language/>

Its testing guidance names three techniques and, importantly, sequences them: **paraphrase
testing** (best for short pages), **usability testing** (best for longer documents where
finding the right information matters), and **controlled comparative studies** ("large scale
studies where you don't meet the people but you collect statistics on responses"), with the
explicit advice to "use paraphrase testing and usability testing on a smaller scale first."
It also warns that focus groups measure attitudes, not comprehension, and are therefore
"more relevant to understanding your audience before you write than to testing."
Source: <https://digital.gov/guides/plain-language/test>

**Implication for us.** Our automated pairwise judging *is* a controlled comparative study.
The guidance says to validate with small-scale paraphrase testing first. The cheap analogue:
have a second model, given only the response, answer comprehension questions or restate the
key decision — a machine paraphrase test — and check that the candidate prompt improves
recovery of the answer, not just its appearance.

### 6.3 Controlled technical English

ASD-STE100 (Simplified Technical English) is a controlled language developed to help readers
of English maintenance documentation understand what they read; it is a requirement of ATA
i2200 and the S1000D specification, and is recommended by EDSTAR as a best-practice standard
for defense technical documentation. It consists of **Writing Rules (Part 1) covering grammar
and style, and a Dictionary of controlled vocabulary (Part 2)**, with words "chosen for their
simplicity and ease of recognition" and the governing principle "one word – one meaning" and
"one part of speech for one word." Project- or company-specific technical names and technical
verbs remain permitted on top of the core vocabulary. The current issue is Issue 8, dated
April 2021.
Source: <https://www.asd-ste100.org/about.html>

The stated motivation is the closest published analogue to our bilingual problem: English
"is often not the native language of the readers (or even of the authors)" of technical
documentation, and roughly **80% of the airline customers who requested the standard are not
native English speakers**; complex sentence structures and words with many meanings and
synonyms are named as the specific sources of confusion.
Source: <https://www.asd-ste100.org/about.html>

**Implication for us.** STE supports two ideas worth encoding in a candidate prompt and in
deterministic checks: consistent terminology (do not vary the word for a thing within a
response), and preservation of technical names verbatim. It does *not* support imposing a
restricted general vocabulary on a conversational assistant — STE is scoped to maintenance
documentation, and its own site notes that adoption "beyond its intended purpose" is outside
what it was designed for.

### 6.4 Spanish readability — do not reuse English scales

This is the single most important bilingual finding. The validation study for the **Escala
INFLESZ** examined 210 randomly selected Spanish publications (newsstand magazines, school
textbooks, scientific journals), computed the Flesch-Szigriszt index, and concluded that
**"ni la Escala de Nivel de Perspicuidad de Szigriszt ni la Escala RES de Flesch son
adecuadas para los hábitos lectores españoles"** — neither Szigriszt's scale nor Flesch's
original Reading Ease scale is appropriate for Spanish reading habits.

The study proposes the INFLESZ scale with five bands: **Muy Difícil (<40), Algo Difícil
(40–55), Normal (55–65), Bastante Fácil (65–80), Muy Fácil (>80)**, and concludes that health
texts are more likely to be read and understood if they score **above 55**. Observed means
were 60 for newsstand magazines, 67.39 for school textbooks, and 37.9 for scientific
journals.
Source: <https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S1137-66272008000300004>

**Implication for us.** Never compare a raw Flesch-Kincaid number for an English response
against a raw readability number for a Spanish response, and never set one shared threshold.
Score each language against its own scale, and compare only **within-language deltas**
(candidate minus control). The cross-language question we can legitimately ask is "does the
prompt help in Spanish as much as in English," not "is the Spanish output as readable as the
English output."

### 6.5 Bilingual case construction

OpenAI's MMMLU dataset translated the MMLU test set into 14 locales — including `ES_LA`
(Spanish) — **using professional human translators**, on the stated reasoning that "relying
on human translators for this evaluation increases confidence in the accuracy of the
translations."
Source: <https://huggingface.co/datasets/openai/MMMLU>

The precedent from a first-party multilingual eval is therefore: parallel items, human
authored or human translated, not machine translated. Our suite's existing design note —
that English and Spanish cases are "paired by scenario and intended to test equivalent
capabilities, not exact translation matching" — is a defensible variant, but it means the
en/es pair is a *scenario* pair, and per-language results should be reported separately
before being pooled.

---

## 7. Cost and latency

Anthropic's latency guidance defines the two metrics to record:

- **Baseline latency** — "the time taken by the model to process the prompt and generate the
  response, without considering the input and output tokens per second."
- **Time to first token (TTFT)** — "the time it takes for the model to generate the first
  token of the response, from when the prompt was sent," described as "particularly relevant
  when you're using streaming."

Source: <https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency>

The same page carries a sequencing warning that applies directly to prompt selection:
"It's always better to first engineer a prompt that works well without model or prompt
constraints, and then try latency reduction strategies afterward. Trying to reduce latency
prematurely might prevent you from discovering what top performance looks like."
Source: <https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency>

For cost, OpenAI's eval run object reports per-model usage as
`prompt_tokens`, `completion_tokens`, `total_tokens`, and `cached_tokens`, alongside
`invocation_count` — the correct granularity for attributing cost to a prompt variant.
Source: <https://platform.openai.com/docs/guides/evals>

Anthropic's success-criteria list treats latency and price as first-class criteria with
their own thresholds ("95% response time < 200ms" appears in its worked multidimensional
example), not as afterthoughts.
Source: <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>

**Implication for us.** An appended prompt has a fixed input-token cost on *every* request,
so its cost impact is dominated by output-token inflation, not by its own length. Report
median and p95 output tokens per case, and report cost as a percentage change against
control. Latency should be reported as a distribution, never as a mean.

---

## 8. Recommended method for pi-clarity

### 8.1 Run matrix

Fixed factors: 24 cases (12 scenario pairs × 2 languages), 4 prompt variants
(`control`, `minimal`, `balanced`, `strong`), 2 models
(`cliproxy-codex/gpt-5.6-sol`, `cliproxy-claude/claude-opus-5`).

Use **5 repetitions** per cell. That is 24 × 4 × 2 × 5 = **960 runs**. Repetitions exist to
shrink within-case variance under recommendation #3, not to grow `n`
(<https://www.anthropic.com/research/statistical-approach-to-model-evals>).
Fix sampling parameters across variants, and hold seeds/ordering constant across variants so
the candidate and control see identical conditions — the pairing that makes recommendation
#4 pay off.

Record per run: model, provider, prompt variant, case id, pair id, language, repetition
index, TTFT, total latency, input tokens, output tokens, cached tokens, stop reason, and
any tool calls. Persist raw text unmodified.

### 8.2 Layer 1 — hard gates (deterministic + rubric, blocking)

Score `hard_gate_expectations` per case. A candidate variant is **rejected outright** if, on
any model or language, its gate pass rate is worse than control by more than the paired
confidence interval — no presentation gain can buy back a gate failure. This is the
repository's stated rule and matches Anthropic's guidance to treat task fidelity as its own
criterion rather than a dimension to be traded off
(<https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>).

Also gate, as pure regressions:

- **Tool use** — tool-call presence and validity on `tool_use` and `agent_workspace` cases.
- **Depth** — on `long_form` and `architecture` cases, output tokens must not fall more than
  a preregistered margin below control. A "clarity" prompt that truncates analysis is a
  regression, not an improvement.
- **Verbatim fidelity** — code, commands, paths, identifiers, and quoted text must survive
  byte-identical. Deterministic check, no judge.
- **Language fidelity** — Spanish cases answered in Spanish.

### 8.3 Layer 2 — deterministic presentation metrics (descriptive)

Computed, never judged: mean and p90 sentence length; paragraph length distribution;
heading count and maximum depth; list-item share of total lines; code-fence balance;
answer-first detection (does the first sentence contain the answer or a preamble); acronym
gloss-on-first-use rate.

Readability is computed **per language against its own scale** — English with an
English-calibrated index, Spanish against the INFLESZ bands (Normal 55–65, target > 55), with
proper names, titles, identifiers, and code spans stripped before scoring, per WCAG 3.1.5's
own definition.
Sources: <https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S1137-66272008000300004>,
<https://www.w3.org/TR/WCAG22/#reading-level>

Report within-language deltas versus control. Do not compare English and Spanish absolute
scores.

### 8.4 Layer 3 — blind pairwise judging (selection signal)

Only for the question code cannot answer: is the candidate response clearer, at equal task
quality?

Required controls, each traceable to a documented failure mode:

- **Blind and randomize position.** Variant identities hidden; A/B order randomized per
  comparison; run each comparison in both orders and count only order-consistent
  preferences. Mitigates position bias (<https://arxiv.org/abs/2306.05685>).
- **Control verbosity.** Record the length delta with every judgment and report win rate
  stratified by it. If the candidate wins only where it is longer, the finding is verbosity
  bias, not clarity (<https://arxiv.org/abs/2306.05685>).
- **Cross-model judging.** Judge outputs from one model with the other, never with itself
  (<https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>).
- **Discrete output with discarded reasoning.** Judge reasons first, then emits one of
  `A` / `B` / `tie`; the reasoning is stored for audit but not scored
  (<https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>).
- **Few-shot anchors.** Include great / fair / poor exemplars in the judge prompt
  (<https://platform.openai.com/docs/guides/graders>).
- **Calibrate the judge before use.** Hand-order a small set of response triples and confirm
  the judge reproduces the ordering; re-run this check whenever the judge prompt or judge
  model changes (<https://platform.openai.com/docs/guides/graders>).

Add a **machine paraphrase test** as an independent comprehension signal: a separate model,
shown only the response, answers a fixed comprehension probe for the case. Improvement in
answer recovery is evidence of comprehension, whereas a judge's preference is evidence of
appeal. This is the automated analogue of the paraphrase testing that plain-language
guidance recommends running before a controlled comparative study
(<https://digital.gov/guides/plain-language/test>).

### 8.5 Analysis

Analyze **paired case-level differences** (candidate − control, same case, model, language),
averaging repetitions within a case first, then applying the CLT across the 24 cases. Report
mean difference, SEM, 95% CI, and the correlation between paired scores. Cluster standard
errors by scenario `pair_id`, since the en/es members of a pair are not independent draws.
All four steps follow
<https://www.anthropic.com/research/statistical-approach-to-model-evals>.

Report each model and each language separately before pooling. A prompt that helps
`gpt-5.6-sol` and hurts `claude-opus-5`, or helps in English and hurts in Spanish, is not a
winner — and pooling hides exactly that.

### 8.6 Acceptance thresholds (preregister before running)

State these in `reports/` before the first run, so they cannot be tuned to the result.

| Criterion | Threshold |
|---|---|
| Hard-gate pass rate | 95% CI of the paired delta vs. control excludes any drop > 2 points, **for every model × language cell** |
| Tool-call validity | No regression vs. control |
| Long-form / architecture output tokens | Median ≥ 90% of control |
| Verbatim fidelity | 100% — any violation rejects the variant |
| Clarity win rate (order-consistent, blind) | Lower bound of 95% CI > 50% on **both** models |
| Comprehension probe accuracy | ≥ control, per language |
| Spanish readability | Within-language delta ≥ 0; INFLESZ ≥ 55 where control already is |
| Output tokens overall | Median inflation ≤ 15% vs. control |
| TTFT and total latency | p95 within 10% of control |

Given the power analysis in §4, a suite of 24 cases can only certify effects of roughly 0.57
SD or larger. If a candidate passes every gate but its clarity advantage is not separable
from noise, the honest report is "no measurable improvement," and the project's stated
preference for "the smallest prompt that produces a reliable improvement" resolves in favor
of control.

### 8.7 Guarding the selection process

Because we are optimizing prompt wording against a judge, we are exposed to the prompt-level
form of grader hacking — scoring well on the model grader while a human would disagree
(<https://platform.openai.com/docs/guides/graders>). Two cheap defenses:

1. **Hold out cases.** Reserve a subset of scenario pairs, never inspected during prompt
   iteration, and report the winner's performance on them separately. This is the held-out
   test set that Anthropic's success-criteria examples assume
   (<https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>).
2. **Spot-check with humans.** Read a small random sample of the judge's decisive
   judgments. If the judge and a human reader disagree systematically, the judge is the
   thing that needs fixing, not the prompt
   (<https://platform.openai.com/docs/guides/graders>).

---

## Sources

- Anthropic — Define success criteria and build evaluations:
  <https://platform.claude.com/docs/en/test-and-evaluate/develop-tests>
- Anthropic — A statistical approach to model evaluations:
  <https://www.anthropic.com/research/statistical-approach-to-model-evals>
- Miller, E. — Adding Error Bars to Evals: A Statistical Approach to Language Model
  Evaluations: <https://arxiv.org/abs/2411.00640>
- Anthropic — Reducing latency:
  <https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency>
- OpenAI — Working with evals: <https://platform.openai.com/docs/guides/evals>
- OpenAI — Graders: <https://platform.openai.com/docs/guides/graders>
- OpenAI — Getting started with datasets:
  <https://developers.openai.com/api/docs/guides/evaluation-getting-started>
- OpenAI Cookbook — Detecting prompt regressions:
  <https://developers.openai.com/cookbook/examples/evaluation/use-cases/regression>
- OpenAI — MMMLU (Multilingual MMLU, professional human translations):
  <https://huggingface.co/datasets/openai/MMMLU>
- Zheng, L. et al. — Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (NeurIPS 2023
  Datasets and Benchmarks): <https://arxiv.org/abs/2306.05685>
- W3C — WCAG 2.2, SC 3.1.5 Reading Level: <https://www.w3.org/TR/WCAG22/#reading-level>
- ASD — ASD-STE100 Simplified Technical English, Issue 8 (April 2021):
  <https://www.asd-ste100.org/about.html>
- Barrio-Cantalejo, I.M. et al. — Validación de la Escala INFLESZ para evaluar la
  legibilidad de los textos dirigidos a pacientes, *Anales Sis San Navarra* 31(2), 2008:
  <https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S1137-66272008000300004>
- Digital.gov — Plain language guide series (Plain Writing Act of 2010):
  <https://digital.gov/guides/plain-language/>
- Digital.gov — Writing for understanding:
  <https://digital.gov/guides/plain-language/writing>
- Digital.gov — Test for understanding: <https://digital.gov/guides/plain-language/test>
