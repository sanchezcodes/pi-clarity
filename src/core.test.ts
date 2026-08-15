import assert from "node:assert/strict";
import test from "node:test";
import { buildPiCommand, makeRunId } from "./core.js";
import type { RunSpec } from "./types.js";

function spec(overrides: Partial<RunSpec> = {}): RunSpec {
  return {
    schemaVersion: 1,
    suiteId: "suite",
    suiteVersion: "suite-hash",
    provider: "provider-a",
    model: "model-x",
    variantId: "minimal",
    variantSha256: "variant-hash",
    caseId: "case-en",
    caseSha256: "case-hash",
    language: "en",
    category: "simple",
    executionMode: "single_turn",
    repetition: 1,
    candidateText: "Prefer direct answers.",
    casePrompt: "Answer this.",
    ...overrides,
  };
}

test("buildPiCommand constructs isolated JSON mode invocation", () => {
  const command = buildPiCommand(spec(), "/usr/local/bin/pi");
  assert.equal(command.executable, "/usr/local/bin/pi");
  assert.deepEqual(command.args.slice(0, 9), [
    "--mode", "json",
    "--no-session",
    "--provider", "provider-a",
    "--model", "model-x",
    "--append-system-prompt", "Prefer direct answers.",
  ]);
  assert.equal(command.args.at(-1), "Answer this.");
  assert.ok(command.args.includes("--no-context-files"));
  assert.ok(command.args.includes("--no-extensions"));
});

test("run IDs are deterministic and repetition-sensitive", () => {
  const first = makeRunId(spec());
  assert.equal(first, makeRunId(spec()));
  assert.notEqual(first, makeRunId(spec({ repetition: 2 })));
  assert.notEqual(first, makeRunId(spec({ variantSha256: "changed" })));
});

test("run IDs do not expose prompt text", () => {
  const id = makeRunId(spec({ candidateText: "secret candidate contents" }));
  assert.doesNotMatch(id, /secret|contents/);
});
