import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { EvaluationCase, EvaluationSuite, ModelTarget, PromptVariant, RunSpec } from "./types.js";

export const DEFAULT_MODELS = [
  "cliproxy-codex/gpt-5.6-sol",
  "cliproxy-claude/claude-opus-5",
];

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseModelTarget(value: string): ModelTarget {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid model target '${value}'; expected provider/model`);
  }
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

export function makeCasePrompt(evaluationCase: EvaluationCase): string {
  if (evaluationCase.execution_mode === "multi_turn") {
    if (!evaluationCase.turns?.length) throw new Error(`Case ${evaluationCase.id} has no turns`);
    return [
      "The evaluation case contains a sequence of user turns. Respond to each turn in order, preserving conversational context. Clearly delimit each assistant response.",
      ...evaluationCase.turns.map((turn, index) => `\nUser turn ${index + 1}:\n${turn.content}`),
    ].join("\n");
  }
  if (!evaluationCase.prompt) throw new Error(`Case ${evaluationCase.id} has no prompt`);
  return evaluationCase.prompt;
}

export function createRunSpec(input: {
  suite: EvaluationSuite;
  suiteVersion: string;
  target: ModelTarget;
  variant: PromptVariant;
  evaluationCase: EvaluationCase;
  repetition: number;
}): RunSpec {
  const { suite, suiteVersion, target, variant, evaluationCase, repetition } = input;
  const fixture = evaluationCase.workspace_fixture?.files;
  return {
    schemaVersion: 1,
    suiteId: suite.suite_id,
    suiteVersion,
    provider: target.provider,
    model: target.model,
    variantId: variant.id,
    variantSha256: variant.sha256,
    caseId: evaluationCase.id,
    caseSha256: sha256(stableJson(evaluationCase)),
    language: evaluationCase.language,
    category: evaluationCase.category,
    executionMode: evaluationCase.execution_mode,
    repetition,
    candidateText: variant.text,
    casePrompt: makeCasePrompt(evaluationCase),
    ...(fixture ? { fixture } : {}),
  };
}

export function makeRunId(spec: RunSpec): string {
  const identity = {
    schemaVersion: spec.schemaVersion,
    suiteId: spec.suiteId,
    suiteVersion: spec.suiteVersion,
    provider: spec.provider,
    model: spec.model,
    variantId: spec.variantId,
    variantSha256: spec.variantSha256,
    caseId: spec.caseId,
    caseSha256: spec.caseSha256,
    repetition: spec.repetition,
  };
  const readable = [spec.provider, spec.model, spec.variantId, spec.caseId, `r${spec.repetition}`]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 100);
  return `${readable}-${sha256(stableJson(identity)).slice(0, 16)}`;
}

export function buildPiCommand(spec: RunSpec, piBin = "pi"): { executable: string; args: string[] } {
  return {
    executable: piBin,
    args: [
      "--mode", "json",
      "--no-session",
      "--provider", spec.provider,
      "--model", spec.model,
      "--append-system-prompt", spec.candidateText,
      "--no-context-files",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-approve",
      spec.casePrompt,
    ],
  };
}

export async function loadSuite(path: string): Promise<{ suite: EvaluationSuite; version: string }> {
  const raw = await readFile(path, "utf8");
  const suite = JSON.parse(raw) as EvaluationSuite;
  if (!suite.suite_id || !Array.isArray(suite.cases)) throw new Error(`Invalid evaluation suite: ${path}`);
  return { suite, version: sha256(raw) };
}

export async function loadPromptVariants(directory: string): Promise<PromptVariant[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && extname(entry.name) === ".md")
    .sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    const text = await readFile(path, "utf8");
    return { id: basename(entry.name, ".md"), path, text, sha256: sha256(text) };
  }));
}

export function csv(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

export function matchesFilter(value: string, filter: string[] | undefined): boolean {
  return !filter?.length || filter.some((candidate) => candidate === value || value.includes(candidate));
}

export function resultPath(resultsDir: string, runId: string): string {
  return join(resultsDir, `${runId}.json`);
}
