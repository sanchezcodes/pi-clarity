#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MODELS,
  createRunSpec,
  csv,
  loadPromptVariants,
  loadSuite,
  makeRunId,
  matchesFilter,
  parseModelTarget,
} from "./core.js";
import {
  buildAnalysis,
  buildJudgeTasks,
  buildPairs,
  caseInfoFromSuite,
  executeJudgment,
  judgmentExists,
  loadJudgments,
  matchesModelFilter,
  type JudgePair,
  type Stage,
} from "./judge.js";
import { executeRun, resultExists } from "./runner.js";
import { createSummary, loadResults } from "./summary.js";
import type { RunResult, RunSpec } from "./types.js";

interface ParsedArgs { values: Map<string, string[]>; flags: Set<string> }

function parseArgs(args: string[]): ParsedArgs {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  const booleanFlags = new Set(["dry-run", "no-resume", "help"]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (booleanFlags.has(key)) {
      flags.add(key);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, [...(values.get(key) ?? []), value]);
    index += 1;
  }
  return { values, flags };
}

function value(args: ParsedArgs, key: string, fallback?: string): string | undefined {
  return args.values.get(key)?.at(-1) ?? fallback;
}

function listValue(args: ParsedArgs, key: string, fallback?: string): string[] | undefined {
  const values = args.values.get(key);
  return values?.flatMap((item) => csv(item) ?? []) ?? csv(fallback);
}

function positiveInteger(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function printHelp(): void {
  console.log(`Pi evaluation harness

Commands:
  npm run run -- [options]
  npm run summarize -- [options]
  npm run judge -- [options]
  npm run analyze -- [options]

Run options:
  --models <provider/model,...>  Matrix targets, always fully qualified (repeatable)
  --variants <id,...>           Filter prompt filenames without .md
  --cases <id,...>              Filter case IDs
  --languages <lang,...>        Filter languages (for example en,es)
  --categories <name,...>       Filter case categories
  --providers <name,...>        Filter providers after loading targets
  --repetitions <n>             Default: 3
  --concurrency <n>             Default: 2
  --max-calls <n>               Maximum pending Pi invocations; default: 100
  --timeout-ms <n>              Per-process timeout; default: 600000
  --results-dir <path>          Default: results/raw
  --pi-bin <path>               Default: pi
  --dry-run                     Print the selected plan without invoking Pi
  --no-resume                   Re-run even when a deterministic result exists

Summarize options:
  --results-dir <path>          Default: results/raw
  --output <path>               Also write summary JSON to this path

Judge options (blinded pairwise candidate vs control):
  --models <provider/model|model|provider,...>  Pair filter; a fully qualified
                                target such as cliproxy-codex/gpt-5.6-sol works,
                                as does a bare model or provider (repeatable)
  --variants/--cases/--languages/--categories   Pair filters
  --repetitions <n>             Judge only repetitions 1..n
  --results-dir <path>          Default: results/raw
  --judgments-dir <path>        Default: results/judgments
  --concurrency <n>             Default: 2
  --max-calls <n>               Maximum pending judge invocations; default: 100
  --timeout-ms <n>              Per-judge timeout; default: 600000
  --pi-bin <path>               Default: pi
  --dry-run                     Print the judging plan without invoking Pi
  --no-resume                   Re-judge pairs that already have a judgment file

Analyze options:
  --results-dir <path>          Default: results/raw
  --judgments-dir <path>        Default: results/judgments
  --stage <stageA|stageB>       Preregistered bar set; default: stageA
  --output <path>               Also write analysis JSON to this path

Judging is cross-model (claude-opus-5 judges gpt-5.6-sol outputs and vice versa),
blinded, and run in both A/B orders; only order-consistent preferences count.
Acceptance bars are frozen in reports/preregistration.md and, for the refined
candidate, reports/preregistration-v2.md. Judge prompt exploratory-2 scopes flags
to each response; judgments recorded under exploratory-1 keep unscoped flags,
which analysis reports as audit notes only, never as candidate evidence.

The runner uses '--mode json' rather than '-p' because Pi's JSON event stream
contains the authoritative final message plus provider-reported usage metadata.
Raw stdout JSONL, stderr, result JSON, and isolated workspaces remain under
results/raw, which is gitignored.

Multi-turn cases are represented as one structured prompt because JSON mode is
a one-shot process. This preserves turn text but is not a true interactive
conversation; treat those cases as provisional or run them with a future RPC
adapter. The maximum-call limit counts Pi process invocations, not internal
model turns caused by tool calls.`);
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = Array<R>(items.length);
  let next = 0;
  async function runWorker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function runCommand(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  if (args.flags.has("help")) return printHelp();
  const casesPath = resolve(value(args, "cases-file", "cases/evaluation-cases.json")!);
  const promptsDir = resolve(value(args, "prompts-dir", "prompts")!);
  const resultsDir = resolve(value(args, "results-dir", process.env.PI_EVAL_RESULTS_DIR ?? "results/raw")!);
  const repetitions = positiveInteger(value(args, "repetitions", process.env.PI_EVAL_REPETITIONS), "repetitions", 3);
  const concurrency = positiveInteger(value(args, "concurrency", process.env.PI_EVAL_CONCURRENCY), "concurrency", 2);
  const maxCalls = positiveInteger(value(args, "max-calls", process.env.PI_EVAL_MAX_CALLS), "max-calls", 100);
  const timeoutMs = positiveInteger(value(args, "timeout-ms", process.env.PI_EVAL_TIMEOUT_MS), "timeout-ms", 600_000);
  const piBin = value(args, "pi-bin", process.env.PI_EVAL_PI_BIN ?? "pi")!;
  const modelValues = listValue(args, "models", process.env.PI_EVAL_MODELS) ?? DEFAULT_MODELS;
  const providers = listValue(args, "providers");
  const variantsFilter = listValue(args, "variants");
  const casesFilter = listValue(args, "cases");
  const languages = listValue(args, "languages");
  const categories = listValue(args, "categories");

  const [{ suite, version }, allVariants] = await Promise.all([loadSuite(casesPath), loadPromptVariants(promptsDir)]);
  const targets = modelValues.map(parseModelTarget).filter((target) => matchesFilter(target.provider, providers));
  const variants = allVariants.filter((variant) => matchesFilter(variant.id, variantsFilter));
  const evaluationCases = suite.cases.filter((item) =>
    matchesFilter(item.id, casesFilter) && matchesFilter(item.language, languages) && matchesFilter(item.category, categories));
  if (!targets.length || !variants.length || !evaluationCases.length) throw new Error("Filters selected an empty matrix");

  const specs: RunSpec[] = [];
  for (const target of targets) for (const variant of variants) for (const evaluationCase of evaluationCases) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      specs.push(createRunSpec({ suite, suiteVersion: version, target, variant, evaluationCase, repetition }));
    }
  }

  await mkdir(resultsDir, { recursive: true });
  const resume = !args.flags.has("no-resume");
  const pending: RunSpec[] = [];
  let skipped = 0;
  for (const spec of specs) {
    if (resume && await resultExists(resultsDir, makeRunId(spec))) skipped += 1;
    else pending.push(spec);
  }
  const plan = {
    suiteId: suite.suite_id,
    suiteVersion: version,
    targets,
    variants: variants.map(({ id, sha256 }) => ({ id, sha256 })),
    cases: evaluationCases.map(({ id, language, category, execution_mode }) => ({ id, language, category, executionMode: execution_mode })),
    repetitions,
    totalRuns: specs.length,
    skipped,
    pending: pending.length,
    concurrency,
    maxCalls,
    resultsDir,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (args.flags.has("dry-run")) return;
  if (pending.length > maxCalls) {
    throw new Error(`Safety limit: ${pending.length} pending Pi calls exceeds --max-calls ${maxCalls}. Filter the matrix or explicitly raise the limit.`);
  }
  if (!pending.length) return;

  const results = await mapConcurrent(pending, concurrency, async (spec, index) => {
    const runId = makeRunId(spec);
    console.error(`[${index + 1}/${pending.length}] ${runId}`);
    return executeRun(spec, { resultsDir, piBin, timeoutMs });
  });
  const failed = results.filter((result) => result.status === "failed").length;
  console.log(JSON.stringify({ completed: results.length, succeeded: results.length - failed, failed }, null, 2));
  if (failed) process.exitCode = 1;
}

async function summarizeCommand(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  if (args.flags.has("help")) return printHelp();
  const resultsDir = resolve(value(args, "results-dir", process.env.PI_EVAL_RESULTS_DIR ?? "results/raw")!);
  const output = value(args, "output");
  const summary = await createSummary(resultsDir, output ? resolve(output) : undefined);
  console.log(JSON.stringify(summary, null, 2));
}

function matchesPairFilters(pair: JudgePair, filters: {
  models?: string[] | undefined;
  variants?: string[] | undefined;
  cases?: string[] | undefined;
  languages?: string[] | undefined;
  categories?: string[] | undefined;
  maxRepetition?: number | undefined;
}): boolean {
  return matchesModelFilter(pair.provider, pair.model, filters.models)
    && matchesFilter(pair.variantId, filters.variants)
    && matchesFilter(pair.caseId, filters.cases)
    && matchesFilter(pair.language, filters.languages)
    && matchesFilter(pair.category, filters.categories)
    && (filters.maxRepetition === undefined || pair.repetition <= filters.maxRepetition);
}

async function judgeCommand(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  if (args.flags.has("help")) return printHelp();
  const casesPath = resolve(value(args, "cases-file", "cases/evaluation-cases.json")!);
  const resultsDir = resolve(value(args, "results-dir", process.env.PI_EVAL_RESULTS_DIR ?? "results/raw")!);
  const judgmentsDir = resolve(value(args, "judgments-dir", process.env.PI_EVAL_JUDGMENTS_DIR ?? "results/judgments")!);
  const concurrency = positiveInteger(value(args, "concurrency", process.env.PI_EVAL_CONCURRENCY), "concurrency", 2);
  const maxCalls = positiveInteger(value(args, "max-calls", process.env.PI_EVAL_MAX_CALLS), "max-calls", 100);
  const timeoutMs = positiveInteger(value(args, "timeout-ms", process.env.PI_EVAL_TIMEOUT_MS), "timeout-ms", 600_000);
  const piBin = value(args, "pi-bin", process.env.PI_EVAL_PI_BIN ?? "pi")!;
  const maxRepetition = args.values.has("repetitions")
    ? positiveInteger(value(args, "repetitions"), "repetitions", 1)
    : undefined;

  const [{ suite }, results] = await Promise.all([loadSuite(casesPath), loadResults(resultsDir)]);
  const runsById = new Map<string, RunResult>(results.map((result) => [result.runId, result]));
  const pairs = buildPairs(results).filter((pair) => matchesPairFilters(pair, {
    models: listValue(args, "models"),
    variants: listValue(args, "variants"),
    cases: listValue(args, "cases"),
    languages: listValue(args, "languages"),
    categories: listValue(args, "categories"),
    maxRepetition,
  }));
  if (!pairs.length) throw new Error("Filters selected no candidate/control pairs");

  const tasks = buildJudgeTasks({ pairs, runsById, caseInfo: caseInfoFromSuite(suite) });
  await mkdir(judgmentsDir, { recursive: true });
  const resume = !args.flags.has("no-resume");
  const pending = [];
  let skipped = 0;
  for (const task of tasks) {
    if (resume && await judgmentExists(judgmentsDir, task.judgmentId)) skipped += 1;
    else pending.push(task);
  }
  console.log(JSON.stringify({
    suiteId: suite.suite_id,
    pairs: pairs.length,
    totalJudgeCalls: tasks.length,
    skipped,
    pending: pending.length,
    judges: [...new Set(tasks.map((task) => `${task.judge.provider}/${task.judge.model}`))],
    concurrency,
    maxCalls,
    judgmentsDir,
  }, null, 2));
  if (args.flags.has("dry-run")) return;
  if (pending.length > maxCalls) {
    throw new Error(`Safety limit: ${pending.length} pending judge calls exceeds --max-calls ${maxCalls}. Filter the matrix or explicitly raise the limit.`);
  }
  if (!pending.length) return;

  const judgments = await mapConcurrent(pending, concurrency, async (task, index) => {
    console.error(`[${index + 1}/${pending.length}] ${task.judgmentId}`);
    const candidate = runsById.get(task.pair.candidateRunId)!;
    const control = runsById.get(task.pair.controlRunId)!;
    return executeJudgment(task, {
      judgmentsDir,
      piBin,
      timeoutMs,
      lengthDeltaChars: candidate.assistantText.length - control.assistantText.length,
    });
  });
  const failed = judgments.filter((judgment) => judgment.status === "failed").length;
  console.log(JSON.stringify({ completed: judgments.length, succeeded: judgments.length - failed, failed }, null, 2));
  if (failed) process.exitCode = 1;
}

async function analyzeCommand(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  if (args.flags.has("help")) return printHelp();
  const resultsDir = resolve(value(args, "results-dir", process.env.PI_EVAL_RESULTS_DIR ?? "results/raw")!);
  const judgmentsDir = resolve(value(args, "judgments-dir", process.env.PI_EVAL_JUDGMENTS_DIR ?? "results/judgments")!);
  const stage = value(args, "stage", "stageA")!;
  if (stage !== "stageA" && stage !== "stageB") throw new Error("--stage must be stageA or stageB");
  const [results, judgments] = await Promise.all([loadResults(resultsDir), loadJudgments(judgmentsDir)]);
  const analysis = buildAnalysis({ results, judgments, stage: stage as Stage });
  const output = value(args, "output");
  if (output) await writeFile(resolve(output), `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(analysis, null, 2));
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "run") await runCommand(args);
  else if (command === "summarize") await summarizeCommand(args);
  else if (command === "judge") await judgeCommand(args);
  else if (command === "analyze") await analyzeCommand(args);
  else if (command === "help" || command === "--help") printHelp();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
