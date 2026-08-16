import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CROSS_JUDGE,
  JUDGE_PROMPT_VERSION,
  buildAnalysis,
  buildJudgePrompt,
  buildJudgeTasks,
  buildPairs,
  candidateDirection,
  candidateSlot,
  judgeTargetFor,
  judgmentIdFor,
  loadJudgments,
  matchesModelFilter,
  normalizeJudgment,
  parseJudgeVerdict,
  readVerdictFlags,
  reconcilePairs,
  wilsonInterval,
  type JudgePair,
  type JudgeVerdict,
  type Judgment,
  type ReadabilityLabel,
} from "./judge.js";
import type { RunResult } from "./types.js";

function run(overrides: {
  variantId: string;
  caseId?: string;
  language?: string;
  category?: string;
  repetition?: number;
  model?: string;
  text?: string;
  status?: RunResult["status"];
  outputTokens?: number;
  wallTimeMs?: number;
  executionMode?: RunResult["spec"]["executionMode"];
}): RunResult {
  const caseId = overrides.caseId ?? "simple-answer-en";
  const repetition = overrides.repetition ?? 1;
  const model = overrides.model ?? "gpt-5.6-sol";
  const runId = `${model}-${overrides.variantId}-${caseId}-r${repetition}`;
  return {
    schemaVersion: 1,
    runId,
    status: overrides.status ?? "succeeded",
    spec: {
      schemaVersion: 1,
      suiteId: "suite",
      suiteVersion: "v",
      provider: "cliproxy-codex",
      model,
      variantId: overrides.variantId,
      variantSha256: "variant-hash",
      caseId,
      caseSha256: "case-hash",
      language: overrides.language ?? "en",
      category: overrides.category ?? "simple_answer",
      executionMode: overrides.executionMode ?? "single_turn",
      repetition,
      casePrompt: "What is the difference between a comet and an asteroid?",
    },
    command: { executable: "pi", args: [], cwd: "/tmp" },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:10.000Z",
    wallTimeMs: overrides.wallTimeMs ?? 1000,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    parsedEventCount: 1,
    malformedJsonLines: 0,
    assistantText: overrides.text ?? `answer from ${overrides.variantId}`,
    usage: {
      input: 100,
      output: overrides.outputTokens ?? 200,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 300,
      cost: 0,
      calls: 1,
    },
  };
}

function pairOf(overrides: Partial<JudgePair> = {}): JudgePair {
  return {
    pairKey: "cliproxy-codex|gpt-5.6-sol|simple-answer-en|1|minimal",
    provider: "cliproxy-codex",
    model: "gpt-5.6-sol",
    caseId: "simple-answer-en",
    pairId: "simple-answer",
    language: "en",
    category: "simple_answer",
    executionMode: "single_turn",
    variantId: "minimal",
    repetition: 1,
    candidateRunId: "candidate-run",
    controlRunId: "control-run",
    ...overrides,
  };
}

function judgment(overrides: {
  round: 0 | 1;
  slot: "A" | "B";
  readability?: ReadabilityLabel | null;
  candidateGate?: "PASS" | "FAIL";
  controlGate?: "PASS" | "FAIL";
  pair?: JudgePair;
  candidateFlags?: string[];
  controlFlags?: string[];
  unscopedFlags?: string[];
  promptVersion?: string;
}): Judgment {
  const pair = overrides.pair ?? pairOf();
  const candidateGate = overrides.candidateGate ?? "PASS";
  const controlGate = overrides.controlGate ?? "PASS";
  const gate = (verdict: "PASS" | "FAIL"): { correctness: "PASS" | "FAIL"; completion: "PASS" | "FAIL" } =>
    ({ correctness: verdict, completion: verdict });
  const candidateFlags = overrides.candidateFlags ?? [];
  const controlFlags = overrides.controlFlags ?? [];
  const gates = overrides.slot === "A"
    ? { A: gate(candidateGate), B: gate(controlGate) }
    : { A: gate(controlGate), B: gate(candidateGate) };
  const flags = overrides.slot === "A"
    ? { A: candidateFlags, B: controlFlags }
    : { A: controlFlags, B: candidateFlags };
  return {
    schemaVersion: 1,
    judgmentId: `${pair.pairKey}-${overrides.round}`,
    promptVersion: overrides.promptVersion ?? JUDGE_PROMPT_VERSION,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "succeeded",
    pair,
    round: overrides.round,
    candidateSlot: overrides.slot,
    judge: { provider: "cliproxy-claude", model: "claude-opus-5" },
    outputIds: { A: "out-a", B: "out-b" },
    lengthDeltaChars: 10,
    verdict: {
      gates,
      readability: overrides.readability === undefined ? "tie" : overrides.readability,
      confidence: "medium",
      rationale: "because",
      flags,
      unscopedFlags: overrides.unscopedFlags ?? [],
    },
    parseError: null,
    rawText: "",
    wallTimeMs: 100,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, calls: 1 },
    error: null,
  };
}

test("cross-judging never lets a model judge its own outputs", () => {
  assert.equal(CROSS_JUDGE["gpt-5.6-sol"], "cliproxy-claude/claude-opus-5");
  assert.equal(CROSS_JUDGE["claude-opus-5"], "cliproxy-codex/gpt-5.6-sol");
  assert.deepEqual(judgeTargetFor("gpt-5.6-sol"), { provider: "cliproxy-claude", model: "claude-opus-5" });
  assert.deepEqual(judgeTargetFor("claude-opus-5"), { provider: "cliproxy-codex", model: "gpt-5.6-sol" });
  assert.throws(() => judgeTargetFor("unknown-model"), /refusing to self-judge/);
});

test("pairs match candidate to control on case, model, and repetition only", () => {
  const results = [
    run({ variantId: "control" }),
    run({ variantId: "minimal" }),
    run({ variantId: "minimal", repetition: 2 }),
    run({ variantId: "strong", model: "claude-opus-5" }),
    run({ variantId: "control", model: "claude-opus-5" }),
    run({ variantId: "balanced", status: "failed" }),
    run({ variantId: "balanced", caseId: "orphan-en", text: "x" }),
  ];
  const pairs = buildPairs(results);
  assert.deepEqual(
    pairs.map((pair) => [pair.model, pair.variantId, pair.repetition]).sort(),
    [["claude-opus-5", "strong", 1], ["gpt-5.6-sol", "minimal", 1]].sort(),
  );
  assert.equal(pairs.every((pair) => pair.variantId !== "control"), true);
});

test("A/B slot is randomized per pair and exactly inverted in round two", () => {
  const keys = Array.from({ length: 24 }, (_unused, index) => `provider|model|case-${index}|1|minimal`);
  for (const key of keys) {
    assert.notEqual(candidateSlot(key, 0), candidateSlot(key, 1), `round 1 must invert round 0 for ${key}`);
  }
  assert.equal(candidateSlot(keys[0]!, 0), candidateSlot(keys[0]!, 0), "slot assignment is deterministic");
  const firstSlots = keys.map((key) => candidateSlot(key, 0));
  assert.equal(new Set(firstSlots).size, 2, "slots vary across pairs");
  const aShare = firstSlots.filter((slot) => slot === "A").length / firstSlots.length;
  assert.ok(aShare > 0.2 && aShare < 0.8, `slot assignment is lopsided: ${aShare}`);
});

test("judgment IDs are deterministic per pair, round, and judge, enabling resume", () => {
  const pair = pairOf();
  const judge = { provider: "cliproxy-claude", model: "claude-opus-5" };
  assert.equal(judgmentIdFor(pair, 0, judge), judgmentIdFor(pair, 0, judge));
  assert.notEqual(judgmentIdFor(pair, 0, judge), judgmentIdFor(pair, 1, judge));
  assert.notEqual(judgmentIdFor(pair, 0, judge), judgmentIdFor(pairOf({ variantId: "strong", pairKey: "x|1|strong" }), 0, judge));
});

test("judge prompt is blinded and gate-first", () => {
  const candidate = run({ variantId: "minimal", text: "Candidate response body." });
  const control = run({ variantId: "control", text: "Control response body." });
  const [task] = buildJudgeTasks({
    pairs: buildPairs([candidate, control]),
    runsById: new Map([[candidate.runId, candidate], [control.runId, control]]),
    caseInfo: new Map([["simple-answer-en", { prompt: "p", expectations: ["Mentions ice."], presentation: [] }]]),
  });
  assert.ok(task);
  const { prompt } = task;
  assert.ok(!prompt.includes("minimal"), "variant identity must not leak");
  assert.ok(!prompt.includes("control"), "control identity must not leak");
  assert.ok(!prompt.includes(candidate.runId) && !prompt.includes(control.runId), "run IDs must not leak");
  assert.ok(prompt.includes(task.outputIds.A) && prompt.includes(task.outputIds.B));
  assert.ok(prompt.includes("Candidate response body.") && prompt.includes("Control response body."));
  assert.ok(prompt.includes("Mentions ice."));
  assert.ok(prompt.indexOf("Correctness gate") < prompt.indexOf("Readability preference"), "gates come first");
});

test("workspace changes are reported neutrally for agent cases", () => {
  const prompt = buildJudgePrompt({
    caseInfo: { prompt: "", expectations: [], presentation: [] },
    casePrompt: "Fix the bug",
    language: "en",
    outputs: {
      A: { outputId: "out-1", text: "done", workspace: "modified: src/app.ts (12 bytes)" },
      B: { outputId: "out-2", text: "done", workspace: "no file changes" },
    },
  });
  assert.ok(prompt.includes("## Workspace changes reported by the harness"));
  assert.ok(prompt.includes("modified: src/app.ts (12 bytes)"));
});

test("verdict parsing accepts a fenced object followed by prose and rejects garbage", () => {
  const { verdict } = parseJudgeVerdict([
    "Reasoning about both responses.",
    "```json",
    '{"gates":{"A":{"correctness":"PASS","completion":"pass"},"B":{"correctness":"FAIL","completion":"PASS"}},',
    '"readability":null,"confidence":"high","rationale":"A is accurate","flags":{"A":[],"B":["truncated_output"]}}',
    "```",
    "Trailing note.",
  ].join("\n"));
  assert.ok(verdict);
  assert.equal(verdict.gates.A.completion, "PASS");
  assert.equal(verdict.gates.B.correctness, "FAIL");
  assert.equal(verdict.readability, null);
  assert.deepEqual(verdict.flags, { A: [], B: ["truncated_output"] });
  assert.deepEqual(verdict.unscopedFlags, []);

  const invalid = parseJudgeVerdict("no verdict here");
  assert.equal(invalid.verdict, null);
  assert.match(invalid.parseError ?? "", /no JSON object/);

  const unknownLabel = parseJudgeVerdict('{"gates":{},"readability":"A_is_amazing"}');
  assert.equal(unknownLabel.verdict?.readability, null);
  assert.equal(unknownLabel.verdict?.gates.A.correctness, "UNJUDGEABLE");
});

test("labels map to the candidate's perspective using the slot it held", () => {
  assert.equal(candidateDirection("A_clearly_better", "A"), "win");
  assert.equal(candidateDirection("A_slightly_better", "B"), "loss");
  assert.equal(candidateDirection("B_clearly_better", "B"), "win");
  assert.equal(candidateDirection("tie", "A"), "tie");
});

test("only order-consistent preferences count", () => {
  const consistent = reconcilePairs([
    judgment({ round: 0, slot: "A", readability: "A_clearly_better" }),
    judgment({ round: 1, slot: "B", readability: "B_slightly_better" }),
  ]);
  assert.equal(consistent[0]?.outcome, "win");

  const flipped = reconcilePairs([
    judgment({ round: 0, slot: "A", readability: "A_clearly_better" }),
    judgment({ round: 1, slot: "B", readability: "A_clearly_better" }),
  ]);
  assert.equal(flipped[0]?.outcome, "inconsistent", "a position-driven flip is discarded");

  const tieVsWin = reconcilePairs([
    judgment({ round: 0, slot: "A", readability: "tie" }),
    judgment({ round: 1, slot: "B", readability: "B_slightly_better" }),
  ]);
  assert.equal(tieVsWin[0]?.outcome, "inconsistent");

  const single = reconcilePairs([judgment({ round: 0, slot: "A", readability: "A_clearly_better" })]);
  assert.equal(single[0]?.outcome, "incomplete");
});

test("gate failures outrank readability", () => {
  const [reconciled] = reconcilePairs([
    judgment({ round: 0, slot: "A", candidateGate: "FAIL", readability: "A_clearly_better" }),
    judgment({ round: 1, slot: "B", candidateGate: "FAIL", readability: "B_clearly_better" }),
  ]);
  assert.equal(reconciled?.candidate, "FAIL");
  assert.equal(reconciled?.outcome, "candidate_only_fail");

  const [bothFail] = reconcilePairs([
    judgment({ round: 0, slot: "A", candidateGate: "FAIL", controlGate: "FAIL" }),
    judgment({ round: 1, slot: "B", candidateGate: "FAIL", controlGate: "FAIL" }),
  ]);
  assert.equal(bothFail?.outcome, "both_fail");

  const [disputed] = reconcilePairs([
    judgment({ round: 0, slot: "A", candidateGate: "PASS" }),
    judgment({ round: 1, slot: "B", candidateGate: "FAIL" }),
  ]);
  assert.equal(disputed?.candidate, "INCONSISTENT");
  assert.equal(disputed?.outcome, "gates_inconsistent");
});

test("wilson interval brackets the observed proportion", () => {
  const interval = wilsonInterval(30, 40);
  assert.ok(interval.low < 0.75 && interval.high > 0.75);
  assert.deepEqual(wilsonInterval(0, 0), { low: 0, high: 1 });
});

test("analysis reports gate rates, order-consistent outcomes, deltas, and acceptance", () => {
  const results: RunResult[] = [];
  const judgments: Judgment[] = [];
  for (const language of ["en", "es"] as const) {
    for (let repetition = 1; repetition <= 2; repetition += 1) {
      const caseId = `simple-answer-${language}`;
      const text = language === "es"
        ? "Los cometas tienen más hielo que los asteroides."
        : "Comets carry more ice than asteroids do.";
      const control = run({ variantId: "control", caseId, language, repetition, text, outputTokens: 100, wallTimeMs: 1000 });
      const candidate = run({ variantId: "minimal", caseId, language, repetition, text, outputTokens: 105, wallTimeMs: 1050 });
      results.push(control, candidate);
      const pair = pairOf({
        pairKey: `p|${language}|${repetition}`,
        caseId,
        language,
        repetition,
        candidateRunId: candidate.runId,
        controlRunId: control.runId,
      });
      judgments.push(
        judgment({ round: 0, slot: "A", readability: "A_clearly_better", pair }),
        judgment({ round: 1, slot: "B", readability: "B_clearly_better", pair }),
      );
    }
  }
  const analysis = buildAnalysis({ results, judgments, stage: "stageA" });

  const pooled = analysis.pairwise.find((row) => row.variantId === "minimal" && row.scope === "pooled");
  assert.equal(pooled?.wins, 4);
  assert.equal(pooled?.losses, 0);
  assert.equal(pooled?.tieAdjustedWinRate, 1);
  assert.equal(pooled?.orderConsistencyRate, 1);

  const candidateRates = analysis.gateRates.filter((row) => row.variantId === "minimal");
  assert.equal(candidateRates.every((row) => row.passRate === 1), true);
  assert.ok(analysis.gateRates.some((row) => row.variantId === "control"));

  const operational = analysis.operational.find((row) => row.variantId === "minimal" && row.language === "en");
  assert.equal(operational?.outputTokenDeltaPct, 5);
  assert.equal(operational?.wallTimeDeltaPct, 5);

  assert.ok(analysis.presentation.some((row) => row.variantId === "minimal" && row.language === "es"));
  assert.equal(analysis.coverage.pairsAvailable, 4);

  const acceptance = analysis.acceptance.find((row) => row.variantId === "minimal");
  assert.equal(acceptance?.status, "inconclusive", "4 decisive pairs is below the preregistered minimum");
  assert.ok(acceptance?.notes.some((note) => note.includes("order-consistent decisive pairs")));
});

test("token inflation and catastrophic flags are enforced against the preregistered bars", () => {
  const results: RunResult[] = [];
  const judgments: Judgment[] = [];
  const control = run({ variantId: "control", outputTokens: 100 });
  const candidate = run({ variantId: "strong", outputTokens: 200 });
  results.push(control, candidate);
  const pair = pairOf({
    variantId: "strong",
    pairKey: "p|en|1|strong",
    candidateRunId: candidate.runId,
    controlRunId: control.runId,
  });
  judgments.push(
    judgment({ round: 0, slot: "A", readability: "A_clearly_better", pair, candidateFlags: ["fabricated_tool_use"] }),
    judgment({ round: 1, slot: "B", readability: "B_clearly_better", pair }),
  );
  const analysis = buildAnalysis({ results, judgments, stage: "stageA" });
  const acceptance = analysis.acceptance.find((row) => row.variantId === "strong");
  assert.equal(acceptance?.status, "reject", "a candidate-attributed catastrophic flag blocks regardless of win rate");
  assert.ok(acceptance?.failures.some((failure) => failure.includes("candidate-attributed catastrophic-flag")));
  assert.ok(acceptance?.failures.some((failure) => failure.includes("median output tokens")));
});

test("judge prompt version is incremented and asks for slot-scoped flags", () => {
  assert.equal(JUDGE_PROMPT_VERSION, "exploratory-2");
  const prompt = buildJudgePrompt({
    caseInfo: { prompt: "", expectations: [], presentation: [] },
    casePrompt: "Explain caching",
    language: "en",
    outputs: {
      A: { outputId: "out-1", text: "first", workspace: "" },
      B: { outputId: "out-2", text: "second", workspace: "" },
    },
  });
  assert.ok(prompt.includes('"flags": {'), "schema must scope flags per response");
  assert.ok(prompt.includes("Put each flag under the response it describes"));
  assert.ok(!/"flags": \[/.test(prompt), "the unscoped array schema must be gone");
});

test("a flag on the control response never blocks the candidate", () => {
  const control = run({ variantId: "control" });
  const candidate = run({ variantId: "strong" });
  const pair = pairOf({
    variantId: "strong",
    pairKey: "p|en|1|strong",
    candidateRunId: candidate.runId,
    controlRunId: control.runId,
  });
  const [reconciled] = reconcilePairs([
    judgment({ round: 0, slot: "A", readability: "A_clearly_better", pair, controlFlags: ["fabricated_tool_use"] }),
    judgment({ round: 1, slot: "B", readability: "B_clearly_better", pair, controlFlags: ["fabricated_tool_use"] }),
  ]);
  assert.deepEqual(reconciled?.candidateFlags, []);
  assert.deepEqual(reconciled?.controlFlags, ["fabricated_tool_use"]);
  assert.equal(reconciled?.catastrophic, false);

  const analysis = buildAnalysis({
    results: [control, candidate],
    judgments: [
      judgment({ round: 0, slot: "A", readability: "A_clearly_better", pair, controlFlags: ["fabricated_tool_use"] }),
      judgment({ round: 1, slot: "B", readability: "B_clearly_better", pair, controlFlags: ["fabricated_tool_use"] }),
    ],
    stage: "stageA",
  });
  const acceptance = analysis.acceptance.find((row) => row.variantId === "strong");
  assert.notEqual(acceptance?.status, "reject");
  assert.ok(acceptance?.notes.some((note) => note.includes("flagged the control response")));
  assert.equal(analysis.flagAudit[0]?.blocking, false);
  assert.deepEqual(analysis.flagAudit[0]?.controlFlags, ["fabricated_tool_use"]);
});

test("legacy unscoped flags are audit notes, never candidate-specific blocking evidence", () => {
  const control = run({ variantId: "control" });
  const candidate = run({ variantId: "strong" });
  const pair = pairOf({
    variantId: "strong",
    pairKey: "p|en|1|strong",
    candidateRunId: candidate.runId,
    controlRunId: control.runId,
  });
  const legacy = (round: 0 | 1, slot: "A" | "B", readability: ReadabilityLabel): Judgment => {
    const base = judgment({ round, slot, readability, pair, promptVersion: "exploratory-1" });
    // Legacy shape on disk: one unscoped array with no slot attribution.
    return { ...base, verdict: { ...base.verdict, flags: ["fabricated_tool_use"] } as unknown as JudgeVerdict };
  };
  const judgments = [legacy(0, "A", "A_clearly_better"), legacy(1, "B", "B_clearly_better")].map(normalizeJudgment);

  const [reconciled] = reconcilePairs(judgments);
  assert.deepEqual(reconciled?.candidateFlags, []);
  assert.deepEqual(reconciled?.unscopedFlags, ["fabricated_tool_use"]);
  assert.equal(reconciled?.catastrophic, false, "an unattributed flag cannot block the candidate");
  assert.equal(reconciled?.unattributedCatastrophic, true);
  assert.equal(reconciled?.outcome, "win", "the readability result is unaffected");

  const analysis = buildAnalysis({ results: [control, candidate], judgments, stage: "stageA" });
  const acceptance = analysis.acceptance.find((row) => row.variantId === "strong");
  assert.notEqual(acceptance?.status, "reject");
  assert.ok(acceptance?.notes.some((note) => note.includes("unattributed catastrophic flags")));
  assert.deepEqual(analysis.flagAudit[0]?.unscopedFlags, ["fabricated_tool_use"]);
  assert.equal(analysis.flagAudit[0]?.blocking, false);
  assert.deepEqual(analysis.coverage.judgePromptVersions, [
    { promptVersion: "exploratory-1", judgments: 2, scopedFlags: false },
  ]);
});

test("readVerdictFlags and loadJudgments read legacy files without rewriting them", async () => {
  assert.deepEqual(readVerdictFlags(null), { A: [], B: [], unscoped: [] });

  const directory = await mkdtemp(join(tmpdir(), "pi-clarity-judgments-"));
  const legacy = judgment({ round: 0, slot: "A", readability: "A_clearly_better", promptVersion: "exploratory-1" });
  const onDisk = JSON.stringify({ ...legacy, verdict: { ...legacy.verdict, flags: ["identity_leakage"] } }, null, 2);
  const path = join(directory, "legacy.json");
  await writeFile(path, onDisk, "utf8");

  const [loaded] = await loadJudgments(directory);
  assert.deepEqual(loaded?.verdict?.flags, { A: [], B: [] });
  assert.deepEqual(loaded?.verdict?.unscopedFlags, ["identity_leakage"]);
  assert.equal(loaded?.promptVersion, "exploratory-1");
  assert.equal(await readFile(path, "utf8"), onDisk, "stored judgments must not be rewritten");
});

test("model filters accept fully qualified targets, bare models, and providers", () => {
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", ["cliproxy-codex/gpt-5.6-sol"]), true);
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", ["gpt-5.6-sol"]), true);
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", ["cliproxy-codex"]), true);
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", ["gpt-5.6"]), true, "substring still works");
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", ["cliproxy-claude/claude-opus-5"]), false);
  assert.equal(matchesModelFilter("cliproxy-claude", "claude-opus-5", ["cliproxy-codex/gpt-5.6-sol"]), false);
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", undefined), true);
  assert.equal(matchesModelFilter("cliproxy-codex", "gpt-5.6-sol", []), true);
});

test("multi-turn pairs are provisional and excluded from pooled decisions", () => {
  const control = run({ variantId: "control", caseId: "repitch-follow-up-en", category: "multi_turn_adaptation", executionMode: "multi_turn" });
  const candidate = run({ variantId: "minimal", caseId: "repitch-follow-up-en", category: "multi_turn_adaptation", executionMode: "multi_turn" });
  const pair = pairOf({
    caseId: "repitch-follow-up-en",
    category: "multi_turn_adaptation",
    executionMode: "multi_turn",
    pairKey: "p|multi|1",
    candidateRunId: candidate.runId,
    controlRunId: control.runId,
  });
  const analysis = buildAnalysis({
    results: [control, candidate],
    judgments: [
      judgment({ round: 0, slot: "A", readability: "A_clearly_better", pair }),
      judgment({ round: 1, slot: "B", readability: "B_clearly_better", pair }),
    ],
    stage: "stageA",
  });
  assert.equal(analysis.provisional.multiTurnPairs, 1);
  const pooled = analysis.pairwise.find((row) => row.variantId === "minimal" && row.scope === "pooled");
  assert.equal(pooled?.pairs, 0, "multi-turn pairs stay out of the pooled slice");
  const provisionalRow = analysis.pairwise.find((row) => row.key === "multi_turn_provisional");
  assert.equal(provisionalRow?.wins, 1);
});
