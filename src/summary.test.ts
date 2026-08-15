import assert from "node:assert/strict";
import test from "node:test";
import { aggregateResults } from "./summary.js";
import type { RunResult } from "./types.js";

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    schemaVersion: 1,
    runId: "run-1",
    status: "succeeded",
    spec: {
      schemaVersion: 1,
      suiteId: "suite",
      suiteVersion: "hash",
      provider: "provider",
      model: "model",
      variantId: "minimal",
      variantSha256: "variant",
      caseId: "case-en",
      caseSha256: "case",
      language: "en",
      category: "simple",
      executionMode: "single_turn",
      repetition: 1,
      casePrompt: "prompt",
    },
    command: { executable: "pi", args: [], cwd: "/tmp" },
    startedAt: "2025-01-01T00:00:00.000Z",
    endedAt: "2025-01-01T00:00:01.000Z",
    wallTimeMs: 100,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    parsedEventCount: 1,
    malformedJsonLines: 0,
    assistantText: "abcd",
    usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 1, totalTokens: 17, cost: 0.01, calls: 1 },
    ...overrides,
  };
}

test("summary aggregation groups dimensions and sums usage", () => {
  const groups = aggregateResults([
    result(),
    result({ runId: "run-2", status: "failed", wallTimeMs: 300, assistantText: "abcdefgh", usage: {
      input: 20, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 28, cost: 0.02, calls: 2,
    } }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], {
    provider: "provider",
    model: "model",
    variantId: "minimal",
    language: "en",
    runs: 2,
    succeeded: 1,
    failed: 1,
    wallTimeMs: { mean: 200, p50: 100, p95: 300 },
    assistantChars: { mean: 6 },
    usage: { input: 30, output: 12, cacheRead: 2, cacheWrite: 1, totalTokens: 45, cost: 0.03, calls: 3 },
  });
});
