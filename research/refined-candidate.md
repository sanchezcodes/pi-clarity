# Refined candidate — design rationale

`prompts/refined.md` is the single Stage B candidate. Unlike the Stage A set, it is an **iteration informed by aggregate Stage A results**, not a blind design. That is disclosed here in full, along with the overfitting risk it creates.

## Provenance and overfitting risk

The Stage A candidates were written before any evaluation case existed. This one was not: it was written after seeing pooled Stage A outcomes.

What informed it, and nothing finer:

- Strong had the best pooled clarity preference (0.678), similar across both models and both languages, with no median latency penalty.
- Strong regressed correctness/completion on `claude-opus-5` Spanish.
- Strong sometimes shortened long-form depth; minimal also shortened depth.
- Balanced helped Spanish and lost in English.

No per-case scores, judge transcripts, raw responses, or expected-property lists were consulted, and no wording was tuned to make a specific case pass. The edits are structural responses to arm-level failure classes.

**The risk remains real.** Four aggregate facts drawn from one pass of one case suite can encode suite-specific quirks — the language mix, the ratio of short-answer to long-form cases, the judge's own style priors — as if they were general truths. Three consequences follow, and the report should treat them as live:

1. Any clarity gain for `refined` over `strong` on the same suite is partly a fitting artefact and is not comparable to Stage A's blind numbers.
2. `control` remains the only unbiased reference point. Refined-vs-control is the claim worth making; refined-vs-strong is suggestive at best.
3. A held-out case set, written by someone who has not read this file, is what would convert the Stage B result into evidence. Failing that, the recommendation should be stated with its provenance attached.

## What was kept

| Idea | Source | Why it survived |
| --- | --- | --- |
| Plain language / lenguaje claro paired anchor | balanced, strong | Cheapest register lever; the Spanish anchor is the plausible cause of balanced's Spanish gain |
| Answer-first ordering | all arms | Present in every arm that beat control; the least controversial lever in the set |
| Format fit | strong | Strong's clarity win is most likely to live here |
| Verbatim code, commands, identifiers, numbers | balanced, strong | Guards technical precision, particularly in Spanish |
| Spanish keeps established English technical terms | strong | Precision lever specific to the regressing cell |

## What was removed, and why

- **Rigid sentence and paragraph thresholds** ("three or four sentences", "one main clause plus at most one subordinate clause"). These are the most plausible mechanism behind the `claude-opus-5` Spanish correctness regression: Spanish carries more words and more subordination per unit of meaning than English, so a clause budget calibrated on English forces either dropped qualifications or split sentences that lose their logical connective. A qualification is exactly the kind of content whose loss reads as an error.
- **The ~300-word heading trigger.** A word-count threshold makes structure a function of length rather than of the answer's shape, which is how template collapse starts. Replaced with a condition on the answer itself: headings appear when there is something to navigate.
- **tú/usted consistency.** Brittle, narrow, and unmeasured; it spent context without a hypothesis attached.
- **The closing takeaway line.** A standing instruction to end with a keepable line invites padding and unsolicited summary, which the rubric penalises as non-intrusion failure.

Every removed item is a numeric or positional threshold. That is the theme: thresholds are what let a presentation prompt reach into content.

## What was added

**Epistemic integrity, stated positively.** _Presentation changes; the content does not._ Then the enumeration of what survives intact: claims, qualifications, uncertainty, assumptions, evidence level, technical precision, and required depth. This is the direct fix for the two Stage A failures that matter most — the Spanish correctness regression and the depth shortening seen in both strong and minimal. It is phrased as a property of the output rather than a prohibition, so no candidate failure ("do not omit caveats") is named into the frame. The depth clause is folded into the same sentence: one place now owns everything that must not move, which makes it a single-source-of-truth edit if a later stage needs to strengthen it.

**Smallest-representation ladder.** _A sentence before a list, a list before a table, a table before a diagram._ Strong told the model which format fits which content; refined orders the formats by weight and makes the lighter one the default. The ladder is ordered from small to large so a diagram sits at the far end and is reached only when nothing lighter carries the content — it is named without being encouraged, which is what "do not add diagrams" would fail to achieve. This directly targets bullet drift and needless tables.

**Automatic re-pitch branch.** The rubric's re-pitch failure is repeating or lightly trimming an earlier answer. The rule fires on a reader signal and prescribes change of angle — fresh entry point, concrete example, or different representation. Two words of project vocabulary (_re-pitch_) do the work, and the branch costs nothing on turns where no signal arrives.

## Counts

| Prompt | Words | Est. tokens |
| --- | --- | --- |
| `minimal.md` | 24 | ~35 |
| `balanced.md` | 142 | ~206 |
| `strong.md` | 298 | ~438 |
| `refined.md` | 150 | ~249 |

Estimated at four characters per token; the harness's reported prompt tokens supersede these. Refined sits at roughly 57% of strong's context load while carrying strong's two highest-value levers plus two new ones.

## Hypotheses

**Benefit.** Clarity preference at or near strong's 0.678, because the levers that plausibly earned it — answer-first, format fit, the plain-language anchors — are all retained. Correctness and completion at control level in every cell, especially `claude-opus-5` Spanish, because the clause budget that squeezed qualifications is gone and the epistemic rule now names qualifications as protected. Long-form depth at control level on the cases that call for it. Lower prompt-token cost than strong, and no latency penalty, since strong showed none at a larger size.

**Failure modes.**

1. **Under-steering in English.** Removing the concrete thresholds may cost the English structure gain that balanced lost and strong won, leaving refined between the two rather than above both.
2. **The epistemic rule reads as a brake.** "Content does not change" could be over-applied into hedging, restated caveats, or a refusal to compress genuinely redundant material — visible as output-token inflation with no clarity gain.
3. **Ladder over-fires.** "A sentence before a list" could suppress lists where a list is genuinely the right form, producing dense prose on branching or parallel content — the mirror image of bullet drift, and equally penalised.
4. **Re-pitch misfires.** The trigger, "the reader signals the explanation did not land", is the fuzziest bound in the prompt. It may fire on ordinary follow-up questions and restructure an answer the user only wanted extended.
5. **Length no longer bounded.** With every explicit brevity threshold gone, only "smallest representation" restrains size. If that is weaker than the removed thresholds, refined regresses on output efficiency against control.
6. **Fitted, not general.** The whole design could simply be tuned to this suite. See the provenance section.

## What would make it the recommendation

Unchanged from Stage A: no regression against control on correctness, completion, or tool use in any model-language cell; a blind pairwise clarity win over control in both languages holding across repetitions; long-form length at control level where depth is called for; output tokens not materially above control. Additionally, for Stage B specifically: the `claude-opus-5` Spanish cell must be clean, since that cell is the reason this candidate exists, and the report must carry the provenance disclosure above wherever the number is quoted.

## Sources

- `research/prompt-candidates.md` — Stage A design rationale and the hypotheses this stage tests.
- `research/rubric.md` — format-fit scoring, non-intrusion, and the re-pitch failure definition.
- `results/analysis-stage-a.json`, `results/summary.json` — the aggregate Stage A outcomes, at the granularity listed above.
- `.agents/skills/writing-great-skills/SKILL.md` and `GLOSSARY.md` (in `dexter-multicloud`) — positive steering over negation, leading words, single source of truth, no-op test, context load.
