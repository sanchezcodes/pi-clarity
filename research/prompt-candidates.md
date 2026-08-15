# Prompt candidates — design rationale

Four conditions for Pi's global appended system prompt, forming a dose ladder from zero to maximal steering. The target reader is technical but not a specialist in the topic at hand, in English and Spanish, while correctness, tool use, coding behaviour, and long-form depth stay at their untreated level.

These candidates were written before any evaluation case existed in `cases/`, and none of them was revised against a case, an expected-property list, or a scored run. The wording is derived only from the design principles below.

## The four conditions

| Condition | File | Words | Est. tokens | Lines | Levers |
| --- | --- | --- | --- | --- | --- |
| Control | `prompts/control.md` | 0 | 0 | 0 | none — empty file |
| Minimal | `prompts/minimal.md` | 24 | ~35 | 1 | answer-first, plain register |
| Balanced | `prompts/balanced.md` | 142 | ~206 | 10 | + layout moves, glossing, headings, depth clause, verbatim clause |
| Strong | `prompts/strong.md` | 298 | ~438 | 23 | + format selection, sentence shape, Spanish register, expanded depth and exactness clauses |

Token counts are estimates at four characters per token. The runner should record the provider's reported prompt tokens per run and supersede this column; the ratios between arms matter more than the absolute values.

`control.md` is a zero-byte file, so the harness appends nothing and the control measures the models' untreated behaviour. If the harness cannot load an empty file, the fix is on the harness side — the file must stay semantically empty rather than gain a placeholder sentence, since any prose would itself be a treatment.

## Design principles applied

From `.agents/skills/writing-great-skills/SKILL.md` and its `GLOSSARY.md`:

- **Predictability.** Each candidate steers the same _process_ every run — answer first, then support — rather than prescribing an output shape that would flatten every reply into the same template.
- **Positive steering.** No candidate contains a prohibition. The failure modes these prompts guard against (jargon walls, wandering openings, translated identifiers, thinned depth) are named only by their positive target: gloss the term, open with the answer, keep code verbatim, length follows the question. Negation would drag the banned behaviour into context and make it more available.
- **Leading words.** _Plain language_ and _lenguaje claro_ carry the whole register instruction in two tokens each, recruiting the plain-language priors both models hold in both languages. The Spanish anchor is not a translation of the English one; it fires a separate body of pretraining, which is why balanced and strong name both rather than relying on English to generalise.
- **Pruning and single source of truth.** Each rule appears once. Register lives in the opening line, layout in Shape, wording in Words, length in Depth, fidelity in Exactness. Changing one behaviour is a one-place edit, and no rule is restated in a second voice.
- **No-op test.** Lines the models already obey by default were cut. "Reply in the user's language" and "be clear and helpful" are no-ops and appear nowhere. "Code appears verbatim, in the language it was written" survives the test only because the surrounding readability pressure — especially in Spanish — is what makes translating identifiers or simplifying a snippet newly tempting.
- **Low context load.** This text is appended to every turn, so it competes with the user's actual task for attention. The ladder is built to find the cheapest arm that works, not to make the strong arm win.

## Why the arms differ in kind, not only in length

A pure length ladder would confound dose with content and leave the result unactionable. Each step up adds a distinct class of instruction, so a difference between adjacent arms points at a specific lever:

- Minimal is a **register and ordering** prompt with no layout content at all. It tests whether one answer-first sentence plus an audience calibration is sufficient.
- Balanced adds **layout** (paragraph length, lists, headings) and **glossing**, plus the two preservation clauses that protect depth and code. It tests whether explicit structure beats register alone.
- Strong adds **format selection** (list vs table vs prose), **sentence-level shape**, and **bilingual register mechanics** (technical loanwords, tú/usted consistency), and states depth and exactness at full strength. It tests where added specificity stops paying and starts distorting.

## Hypotheses

### Control

Baseline. Expect the highest variance across repetitions in structure and opening move, since nothing constrains them; expect no regression on any gate by construction. Spanish replies are the likely weak point — untreated Spanish output tends to longer sentences and heavier subordination than untreated English.

**Failure mode to watch:** none, but the control is also the arm most likely to look competitive on short factual cases, where there is no structure to get right.

### Minimal

**Benefit hypothesis.** The answer-first move is the single highest-yield readability lever and the one most often missing; "in one read" gives the model a checkable bar rather than a vague quality adjective. Near-zero token cost and almost no risk to coding or tool behaviour, since the prompt says nothing about either.

**Failure modes.** (a) Under-steering — the model already leads with the answer often enough that the arm reads as a no-op and shows no measurable gain. (b) On genuinely complex analysis, "plain enough to follow in one read" may be read as a simplicity instruction and shave nuance, since minimal carries no depth-preservation clause to push back. (c) Answer-first applied to exploratory or open-ended questions can force a premature verdict where the honest answer is conditional.

### Balanced

**Benefit hypothesis.** The expected winner on a clarity-per-token basis. The four layout moves are concrete and checkable; the depth clause protects long-form; the verbatim clause protects code and Spanish technical terms. Roughly 200 tokens per turn is small against typical task context.

**Failure modes.** (a) Bullet drift — "reach for a list" over-fires and turns prose answers into fragmented lists, hurting the reasoning cases most. (b) Heading inflation on medium answers that do not need navigation. (c) Glossing terms the user has already demonstrated they know, reading as condescension — a particular risk with an expert user whose expertise the prompt cannot see. (d) The depth clause may be too compact to hold against the surrounding brevity pressure.

### Strong

**Benefit hypothesis.** The most explicit arm should produce the most consistent structure across repetitions and the biggest gain in Spanish, where the register mechanics (loanwords kept, tú/usted consistent, one-clause sentences) address failures the English-only prompts leave untouched. Best case for readers scanning long technical answers.

**Failure modes.** (a) Template collapse — every reply arrives with the same headings regardless of size, the clearest way to lose on short cases. (b) Attention cost: ~440 tokens of formatting instruction on every turn competes with the task and is the arm most likely to degrade tool use, multi-step coding, or instruction following on cases with their own output format, despite the clause deferring to task requirements. (c) Padding — the sentence-shape rule can inflate word count while lowering information density, which shows up as an output-efficiency regression. (d) Over-simplification on the cases that most need depth, if the model reads the density of style rules as a signal that style outranks substance. (e) The Spanish register block is the most specific and therefore most brittle content in the set.

## Known confound

Bilingual anchoring (`lenguaje claro`) is present in balanced and strong but absent from minimal, so language-specific steering is confounded with dose. This is deliberate — the ladder is about dose — but it means a Spanish-only win for balanced over minimal has two candidate explanations. If Spanish results diverge from English, the follow-on arm is minimal plus the Spanish anchor and nothing else, which separates the two.

A second confound: balanced and strong both carry depth and exactness clauses that minimal lacks. Any regression minimal shows on long-form or code fidelity may be an absence-of-guardrail effect rather than an under-steering effect.

## What would make a candidate the recommendation

Per `README.md`, prefer the smallest prompt that produces a reliable improvement. Concretely: no regression against control on correctness, task completion, or tool use; a blind pairwise readability win over control in both languages that holds across repetitions; long-form answers no shorter than control on the cases that call for depth; and output tokens not materially above control. Where two arms clear those bars, the cheaper one wins.

## Sources

- `.agents/skills/writing-great-skills/SKILL.md` and `GLOSSARY.md` (in `dexter-multicloud`) — predictability, positive steering, leading words, pruning, single source of truth, context load, no-op test.
- Federal Plain Language Guidelines, plainlanguage.gov — answer-first ordering, common words over jargon, short sentences, useful headings.
- ISO 24495-1:2023, *Plain language — Part 1: Governing principles and guidelines* — the reader-centred definition of plain language ("find what they need, understand it, use it"), which is where the "first read" completion criterion comes from.
- Red Internacional de Lenguaje Claro / Carta de Lenguaje Claro — Spanish-language plain-language guidance, the basis for treating `lenguaje claro` as a distinct pretrained anchor rather than a translation.
- Nielsen Norman Group, research on how users read on the web (scanning rather than linear reading) — the basis for the headings, front-loading, and scannable-layout moves.
