# Preregistration v2 — refined candidate, exploratory round 2

- **Version:** 2.0 (exploratory, iterative)
- **Status:** FROZEN. Written and committed before any judging under judge prompt
  `exploratory-2`.
- **Builds on:** `reports/preregistration.md` v1.0, which stays in force for everything not
  restated here.
- **Applies to:** one refined candidate prompt versus the no-added-prompt `control`, on both
  models, in both languages.

---

## 1. Instrumentation bug found after Stage A (disclosure)

**What broke.** Judge prompt `exploratory-1` asked for a single top-level `flags` array:

```json
"flags": ["fabricated_tool_use"]
```

Nothing in that shape says *which* response the flag describes. The analyzer nonetheless
treated any catastrophic-looking flag on a pair as candidate-specific blocking evidence, so
a flag raised about the **control** response could reject the **candidate**.

**Blast radius.** 11 of 576 Stage A judgments carried a flag, spread across 9 pairs. Under
the buggy rule they produced `reject` verdicts for all three candidates:

| Variant | Stage A status with the bug | Status after the correction |
|---|---|---|
| `balanced` | reject — "3 catastrophic-flag pair(s)" plus an English win-rate miss | **revise** — English win rate 0.4688 below the 0.50 bar |
| `minimal` | reject — flags plus gate and depth misses | reject — gate drop in `claude-opus-5/es`, long-form token loss |
| `strong` | reject — flags plus gate and depth misses | reject — gate drop on `claude-opus-5`, long-form token loss |

Attribution for those 11 legacy flags is **unrecoverable**: the flagged slot is unknown, and
in two cases the same case was flagged in both rounds while the candidate sat in a different
slot each time. They are not re-judged and not re-attributed.

**Fix, prospective only.**

1. Judge prompt version incremented to `exploratory-2`; flags are now requested per response
   slot (`"flags": {"A": [...], "B": [...]}`) with an explicit instruction that every flag
   must name the response it describes.
2. Analysis blocks a candidate only on flags attributed to the candidate's slot. Flags
   attributed to the control are reported as notes.
3. Legacy `exploratory-1` judgments load unchanged from disk and their unscoped flags become
   **audit notes only** — surfaced in `flagAudit` and in acceptance `notes`, never counted as
   candidate evidence.
4. Because the judgment ID hashes the prompt version, `exploratory-2` judging writes new
   files; **no stored judgment is altered or deleted**.
5. Separately, `--models` filters now accept a fully qualified `provider/model` target, a
   bare model, or a provider, and the help text says so.

**Effect on the historical record.** Stage A conclusions are re-derived from the same stored
judgments with the corrected rule. No Stage A run or judgment is re-executed, and no Stage A
bar is changed.

---

## 2. What is being decided in round 2

Whether one **refined candidate** prompt — informed by Stage A's failure modes (Spanish
task-completion regressions on `claude-opus-5`, long-form and architecture depth loss, and
over-formatting on brief cases) — clears the **unchanged Stage A bars** against `control`.

Only `control` and the refined candidate are in scope. `minimal`, `balanced`, and `strong`
are not re-run.

---

## 3. Frozen design

| Item | Value |
|---|---|
| Cases | the same 24 bilingual cases, unchanged |
| Variants | `control` + one refined candidate |
| Models | `cliproxy-codex/gpt-5.6-sol`, `cliproxy-claude/claude-opus-5` |
| Repetitions | **3** (repetition 3 of `control` is new; repetitions 1–2 are reused as-is) |
| New runs | ≤ 192 (144 candidate + 48 control repetition 3) |
| Pairs | 24 × 2 models × 3 repetitions = **144** |
| Judge calls | 144 × 2 orders = **288**, judge prompt `exploratory-2` |
| Judging protocol | unchanged from v1 §5: blinded, hash-randomized A/B inverted in round 2, cross-model, gates before readability, order-consistent results only |
| Acceptance bars | **identical to v1 §4 Stage A**, restated below |

### 3.1 Bars (unchanged Stage A values)

- Gate pass rate not more than **5 pp** below control pooled per model, and not more than
  **10 pp** below in any model × language cell.
- Zero **candidate-attributed** catastrophic flags. Unattributed legacy flags and
  control-attributed flags do not block.
- Spanish cases answered in Spanish: **100%**, deterministic check.
- Tie-adjusted win rate ≥ **0.55** pooled, ≥ **0.50** in each language, ≥ **0.50** on each
  model, among order-consistent pairs where both outputs pass both gates.
- Order-consistency rate ≥ **0.60**; at least **30** decisive order-consistent pairs;
  repetition-1 judging coverage ≥ **80%** per model × language cell.
- Median output tokens ≤ **+20%** vs. control (≤ **+25%** on brief cases); median wall time
  ≤ **+20%**; long-form and architecture median output tokens ≥ **90%** of control.
- Wilson lower bound reported, not gating (Stage A rule).

Multi-turn cases remain provisional and stay out of pooled acceptance decisions.

### 3.2 Analysis inputs

Acceptance for the refined candidate is computed from `exploratory-2` judgments only, since
it has no earlier judgments. Legacy `exploratory-1` judgments remain loadable so Stage A
variants can still be reported side by side; the `coverage.judgePromptVersions` block makes
the mix explicit in every report.

---

## 4. This is iterative exploratory testing on the same cases

Round 2 reuses the 24 cases that produced round 1's failure analysis, and the refined
candidate was written after seeing round-1 results. That has three consequences, stated
before the data exist:

1. **Overfitting risk is real and unmitigated here.** The candidate is tuned against the
   same items, the same judge family, and the same failure list. A pass shows the prompt no
   longer fails *these* cases; it is not evidence of generalization.
2. **Multiplicity is uncorrected.** This is the second selection round against one bar set.
   Nominal error rates understate the true false-positive rate, and the Stage A power limit
   (roughly 0.57 SD detectable over 24 cases, per `research/evaluation-methods.md` §4) still
   applies.
3. **A pass is a promotion, not a decision.** Clearing round 2 promotes the candidate to
   confirmatory work only. Confirmatory testing must add held-out scenario pairs never used
   for iteration, judge calibration triples, a second judge with an agreement statistic, a
   human spot-check of decisive judgments, and the tighter v1 confirmatory bars.

No bar in §3.1 may be relaxed after seeing round-2 results. If the candidate misses a bar,
the honest outcomes are `revise` or `reject`, and a further iteration requires a v3
preregistration committed before the next judging run.

---

## 5. Limitations carried forward

All limitations in `reports/preregistration.md` §8 still hold: provisional multi-turn
delivery, no neutral artifact report for tool cases, uncalibrated judge, heuristic
readability formulas, uncontrolled provider latency noise, and no held-out cases. Round 2
adds one: **flag attribution exists only from `exploratory-2` onward**, so catastrophic-flag
evidence cannot be compared across round 1 and round 2.
