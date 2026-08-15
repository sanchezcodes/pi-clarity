/**
 * Blinded pairwise candidate-vs-control judging and exploratory analysis.
 *
 * Protocol is frozen in reports/preregistration.md §4–§6:
 *  - each candidate run is paired with the control run from the same case, model and
 *    repetition block;
 *  - variant identity is removed and A/B slots are randomized per pair, then inverted for a
 *    second round; only order-consistent results are counted;
 *  - judging is cross-model (never self-judging);
 *  - correctness and task completion are judged first and cannot be reversed by readability.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseModelTarget, sha256, stableJson } from "./core.js";
import { computePresentationMetrics, meanMetricsDelta, median, percentChange, percentile, round } from "./metrics.js";
import { parsePiOutput } from "./runner.js";
import type { EvaluationSuite, ModelTarget, RunResult, Usage } from "./types.js";

export const JUDGE_PROMPT_VERSION = "exploratory-1";
export const CONTROL_VARIANT_ID = "control";

/** Cross-judging map (preregistration §2): a model never judges its own outputs. */
export const CROSS_JUDGE: Record<string, string> = {
  "gpt-5.6-sol": "cliproxy-claude/claude-opus-5",
  "claude-opus-5": "cliproxy-codex/gpt-5.6-sol",
};

export const EXPLORATORY_BARS = {
  stageA: {
    gateDropPooledPp: 5,
    gateDropCellPp: 10,
    tieAdjustedPooled: 0.55,
    tieAdjustedPerLanguage: 0.5,
    tieAdjustedPerModel: 0.5,
    requireWilsonLowerBoundAbove: null as number | null,
    orderConsistencyRate: 0.6,
    minDecisivePairs: 30,
    minRepetition1Coverage: 0.8,
    outputTokenIncreasePct: 20,
    briefOutputTokenIncreasePct: 25,
    wallTimeIncreasePct: 20,
    depthTokenRetention: 0.9,
  },
  stageB: {
    gateDropPooledPp: 5,
    gateDropCellPp: 10,
    tieAdjustedPooled: 0.6,
    tieAdjustedPerLanguage: 0.55,
    tieAdjustedPerModel: 0.55,
    requireWilsonLowerBoundAbove: 0.5 as number | null,
    orderConsistencyRate: 0.6,
    minDecisivePairs: 45,
    minRepetition1Coverage: 0.8,
    outputTokenIncreasePct: 20,
    briefOutputTokenIncreasePct: 25,
    wallTimeIncreasePct: 20,
    depthTokenRetention: 0.9,
  },
} as const;

export type Stage = keyof typeof EXPLORATORY_BARS;
export type Bars = (typeof EXPLORATORY_BARS)[Stage];

const BRIEF_CATEGORIES = new Set(["simple_answer", "representation_choice"]);
const DEPTH_CATEGORIES = new Set(["long_form", "architecture"]);
const CATASTROPHIC_FLAG = /fabricat|destructive|unauthorized|catastroph|data loss/i;

export type GateVerdict = "PASS" | "FAIL" | "UNJUDGEABLE";
export type ReadabilityLabel =
  | "A_clearly_better"
  | "A_slightly_better"
  | "tie"
  | "B_slightly_better"
  | "B_clearly_better";

export interface JudgeVerdict {
  gates: Record<"A" | "B", { correctness: GateVerdict; completion: GateVerdict }>;
  readability: ReadabilityLabel | null;
  confidence: "low" | "medium" | "high";
  rationale: string;
  flags: string[];
}

export interface JudgePair {
  pairKey: string;
  provider: string;
  model: string;
  caseId: string;
  pairId: string;
  language: string;
  category: string;
  executionMode: string;
  variantId: string;
  repetition: number;
  candidateRunId: string;
  controlRunId: string;
}

export interface JudgeTask {
  judgmentId: string;
  pair: JudgePair;
  round: 0 | 1;
  candidateSlot: "A" | "B";
  judge: ModelTarget;
  prompt: string;
  outputIds: Record<"A" | "B", string>;
}

export interface Judgment {
  schemaVersion: 1;
  judgmentId: string;
  promptVersion: string;
  createdAt: string;
  status: "succeeded" | "failed";
  pair: JudgePair;
  round: 0 | 1;
  candidateSlot: "A" | "B";
  judge: ModelTarget;
  outputIds: Record<"A" | "B", string>;
  /** Output-length delta (candidate minus control chars), for verbosity-bias reporting. */
  lengthDeltaChars: number;
  verdict: JudgeVerdict | null;
  parseError: string | null;
  rawText: string;
  wallTimeMs: number;
  usage: Usage;
  error: string | null;
}

export interface JudgeCaseInfo {
  prompt: string;
  expectations: string[];
  presentation: string[];
}

export function caseInfoFromSuite(suite: EvaluationSuite): Map<string, JudgeCaseInfo> {
  const info = new Map<string, JudgeCaseInfo>();
  for (const evaluationCase of suite.cases) {
    const expectations = evaluationCase.hard_gate_expectations;
    const presentation = evaluationCase.presentation_observations;
    info.set(evaluationCase.id, {
      prompt: typeof evaluationCase.prompt === "string" ? evaluationCase.prompt : "",
      expectations: Array.isArray(expectations) ? expectations.map(String) : [],
      presentation: Array.isArray(presentation) ? presentation.map(String) : [],
    });
  }
  return info;
}

export function judgeTargetFor(model: string): ModelTarget {
  const target = CROSS_JUDGE[model];
  if (!target) throw new Error(`No cross-judge configured for model '${model}'; refusing to self-judge`);
  return parseModelTarget(target);
}

function pairKeyOf(result: RunResult): string {
  return [result.spec.provider, result.spec.model, result.spec.caseId, result.spec.repetition].join("|");
}

export function buildPairs(results: RunResult[]): JudgePair[] {
  const controls = new Map<string, RunResult>();
  for (const result of results) {
    if (result.spec.variantId === CONTROL_VARIANT_ID) controls.set(pairKeyOf(result), result);
  }
  const pairs: JudgePair[] = [];
  for (const candidate of results) {
    if (candidate.spec.variantId === CONTROL_VARIANT_ID) continue;
    if (candidate.status !== "succeeded" || !candidate.assistantText.trim()) continue;
    const control = controls.get(pairKeyOf(candidate));
    if (!control || control.status !== "succeeded" || !control.assistantText.trim()) continue;
    pairs.push({
      pairKey: `${pairKeyOf(candidate)}|${candidate.spec.variantId}`,
      provider: candidate.spec.provider,
      model: candidate.spec.model,
      caseId: candidate.spec.caseId,
      pairId: candidate.spec.caseId.replace(/-(en|es)$/, ""),
      language: candidate.spec.language,
      category: candidate.spec.category,
      executionMode: candidate.spec.executionMode,
      variantId: candidate.spec.variantId,
      repetition: candidate.spec.repetition,
      candidateRunId: candidate.runId,
      controlRunId: control.runId,
    });
  }
  return pairs.sort((a, b) => a.repetition - b.repetition || a.pairKey.localeCompare(b.pairKey));
}

/** Round 0 slot is a deterministic hash of the pair key; round 1 is its exact inverse. */
export function candidateSlot(pairKey: string, round: 0 | 1): "A" | "B" {
  const bit = Number.parseInt(sha256(pairKey).slice(0, 8), 16) % 2;
  const candidateFirst = round === 0 ? bit === 0 : bit !== 0;
  return candidateFirst ? "A" : "B";
}

export function blindOutputId(pairKey: string, runId: string, round: 0 | 1): string {
  return `out-${sha256(`${pairKey}|${runId}|${round}`).slice(0, 12)}`;
}

export function judgmentIdFor(pair: JudgePair, round: 0 | 1, judge: ModelTarget): string {
  const identity = {
    promptVersion: JUDGE_PROMPT_VERSION,
    pairKey: pair.pairKey,
    round,
    judgeProvider: judge.provider,
    judgeModel: judge.model,
  };
  const readable = [pair.model, pair.variantId, pair.caseId, `r${pair.repetition}`, `o${round}`]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 100);
  return `${readable}-${sha256(stableJson(identity)).slice(0, 16)}`;
}

function workspaceReport(result: RunResult): string {
  if (!result.workspace) return "";
  const before = new Map(result.workspace.before.map((file) => [file.path, file.sha256]));
  const changes: string[] = [];
  for (const file of result.workspace.after) {
    const previous = before.get(file.path);
    if (previous === undefined) changes.push(`added: ${file.path} (${file.bytes} bytes)`);
    else if (previous !== file.sha256) changes.push(`modified: ${file.path} (${file.bytes} bytes)`);
    before.delete(file.path);
  }
  for (const path of before.keys()) changes.push(`deleted: ${path}`);
  return changes.length ? changes.sort().join("\n") : "no file changes";
}

export function buildJudgePrompt(input: {
  caseInfo: JudgeCaseInfo;
  casePrompt: string;
  language: string;
  outputs: Record<"A" | "B", { outputId: string; text: string; workspace: string }>;
}): string {
  const { caseInfo, casePrompt, language, outputs } = input;
  const expectations = caseInfo.expectations.length
    ? caseInfo.expectations.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "(none recorded; judge against the user request alone)";
  const workspaceSection = outputs.A.workspace || outputs.B.workspace
    ? [
      "",
      "## Workspace changes reported by the harness",
      `Response ${outputs.A.outputId}:`,
      outputs.A.workspace || "no file changes",
      "",
      `Response ${outputs.B.outputId}:`,
      outputs.B.workspace || "no file changes",
    ].join("\n")
    : "";
  return `You are an impartial evaluation judge. Two assistant responses to the same user request are shown below. You do not know which system produced either one, and you must not speculate.

Judge in this order and do not skip a step.

1. Correctness gate, independently for each response. FAIL when a material claim, code, or conclusion is wrong or misleading, when a tool action or validation is claimed but not evidenced, or when omissions make the answer materially wrong.
2. Task completion gate, independently for each response. FAIL when a requested action, deliverable, section, constraint, audience, scope boundary, or language requirement is not met, or when the response answers a different question.
3. Readability preference, ONLY if both responses pass both gates. Otherwise readability is null. Readability can never reverse a gate result.

Rules:
- Ignore response order. Neither slot is privileged.
- Longer, more heavily formatted, or more heading-rich output is NOT automatically better. Prefer the response that a competent non-specialist reader of this request would understand faster and act on more reliably.
- Do not reward decorative structure on a short request, and do not reward brevity that drops requested substance.
- The response language must match the user's language (this case is '${language}').
- Use UNJUDGEABLE only when the response is empty, truncated, or unreadable.

## User request

${casePrompt}

## Case correctness and completion expectations

${expectations}

## Response ${outputs.A.outputId}

<<<RESPONSE_${outputs.A.outputId}
${outputs.A.text}
RESPONSE_${outputs.A.outputId}
${workspaceSection}

## Response ${outputs.B.outputId}

<<<RESPONSE_${outputs.B.outputId}
${outputs.B.text}
RESPONSE_${outputs.B.outputId}

## Output format

Think first, then output exactly one JSON object as the last thing in your reply, in a \`\`\`json fenced block:

\`\`\`json
{
  "gates": {
    "A": { "correctness": "PASS|FAIL|UNJUDGEABLE", "completion": "PASS|FAIL|UNJUDGEABLE" },
    "B": { "correctness": "PASS|FAIL|UNJUDGEABLE", "completion": "PASS|FAIL|UNJUDGEABLE" }
  },
  "readability": "A_clearly_better|A_slightly_better|tie|B_slightly_better|B_clearly_better|null",
  "confidence": "low|medium|high",
  "rationale": "two sentences of evidence, quoting or naming what decided it",
  "flags": ["fabricated_tool_use", "unauthorized_file_change", "identity_leakage", "truncated_output"]
}
\`\`\`

"A" and "B" in the JSON refer to the first and second responses shown above, in that order. Use an empty array when no flag applies.`;
}

export function buildJudgeTasks(input: {
  pairs: JudgePair[];
  runsById: Map<string, RunResult>;
  caseInfo: Map<string, JudgeCaseInfo>;
}): JudgeTask[] {
  const tasks: JudgeTask[] = [];
  for (const pair of input.pairs) {
    const candidate = input.runsById.get(pair.candidateRunId);
    const control = input.runsById.get(pair.controlRunId);
    if (!candidate || !control) continue;
    const info = input.caseInfo.get(pair.caseId) ?? { prompt: "", expectations: [], presentation: [] };
    for (const round of [0, 1] as const) {
      const slot = candidateSlot(pair.pairKey, round);
      const candidateEntry = {
        outputId: blindOutputId(pair.pairKey, pair.candidateRunId, round),
        text: candidate.assistantText,
        workspace: workspaceReport(candidate),
      };
      const controlEntry = {
        outputId: blindOutputId(pair.pairKey, pair.controlRunId, round),
        text: control.assistantText,
        workspace: workspaceReport(control),
      };
      const outputs = slot === "A"
        ? { A: candidateEntry, B: controlEntry }
        : { A: controlEntry, B: candidateEntry };
      const judge = judgeTargetFor(pair.model);
      tasks.push({
        judgmentId: judgmentIdFor(pair, round, judge),
        pair,
        round,
        candidateSlot: slot,
        judge,
        outputIds: { A: outputs.A.outputId, B: outputs.B.outputId },
        prompt: buildJudgePrompt({
          caseInfo: info,
          casePrompt: candidate.spec.casePrompt,
          language: pair.language,
          outputs,
        }),
      });
    }
  }
  return tasks;
}

const GATE_VALUES = new Set<GateVerdict>(["PASS", "FAIL", "UNJUDGEABLE"]);
const READABILITY_VALUES = new Set<ReadabilityLabel>([
  "A_clearly_better",
  "A_slightly_better",
  "tie",
  "B_slightly_better",
  "B_clearly_better",
]);

function extractJsonObject(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].at(-1)?.[1];
  const candidates = fenced ? [fenced] : [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(text.slice(start, index + 1));
    }
  }
  for (const candidate of candidates.reverse()) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object" && "gates" in parsed) return candidate.trim();
    } catch {
      continue;
    }
  }
  return null;
}

function gateOf(value: unknown): GateVerdict {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  return GATE_VALUES.has(upper as GateVerdict) ? (upper as GateVerdict) : "UNJUDGEABLE";
}

export function parseJudgeVerdict(text: string): { verdict: JudgeVerdict | null; parseError: string | null } {
  const raw = extractJsonObject(text);
  if (!raw) return { verdict: null, parseError: "no JSON object with a 'gates' key found in judge output" };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    return { verdict: null, parseError: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const gates = (parsed.gates ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const readabilityRaw = parsed.readability;
  const readability = typeof readabilityRaw === "string" && READABILITY_VALUES.has(readabilityRaw as ReadabilityLabel)
    ? (readabilityRaw as ReadabilityLabel)
    : null;
  const confidenceRaw = typeof parsed.confidence === "string" ? parsed.confidence.toLowerCase() : "";
  const flags = Array.isArray(parsed.flags) ? parsed.flags.map(String).filter(Boolean) : [];
  return {
    verdict: {
      gates: {
        A: { correctness: gateOf(gates.A?.correctness), completion: gateOf(gates.A?.completion) },
        B: { correctness: gateOf(gates.B?.correctness), completion: gateOf(gates.B?.completion) },
      },
      readability,
      confidence: confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low",
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      flags,
    },
    parseError: null,
  };
}

export function buildJudgeCommand(judge: ModelTarget, prompt: string, piBin = "pi"): { executable: string; args: string[] } {
  return {
    executable: piBin,
    args: [
      "--mode", "json",
      "--no-session",
      "--provider", judge.provider,
      "--model", judge.model,
      "--no-context-files",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-approve",
      prompt,
    ],
  };
}

export function judgmentPath(judgmentsDir: string, judgmentId: string): string {
  return join(judgmentsDir, `${judgmentId}.json`);
}

export async function judgmentExists(judgmentsDir: string, judgmentId: string): Promise<boolean> {
  try {
    return (await stat(judgmentPath(judgmentsDir, judgmentId))).isFile();
  } catch {
    return false;
  }
}

async function spawnJudge(command: { executable: string; args: string[] }, timeoutMs: number): Promise<{
  stdout: string; stderr: string; exitCode: number | null; error?: string;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn(command.executable, command.args, {
      env: { ...process.env, PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let spawnError: string | undefined;
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => { spawnError = error.message; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const base = { stdout, stderr, exitCode };
      if (timedOut) resolvePromise({ ...base, error: `Timed out after ${timeoutMs} ms` });
      else if (spawnError) resolvePromise({ ...base, error: spawnError });
      else resolvePromise(base);
    });
  });
}

export async function executeJudgment(task: JudgeTask, options: {
  judgmentsDir: string;
  piBin: string;
  timeoutMs: number;
  lengthDeltaChars: number;
}): Promise<Judgment> {
  const command = buildJudgeCommand(task.judge, task.prompt, options.piBin);
  const startedNs = process.hrtime.bigint();
  const processResult = await spawnJudge(command, options.timeoutMs);
  const wallTimeMs = Number(process.hrtime.bigint() - startedNs) / 1_000_000;
  const parsed = parsePiOutput(processResult.stdout);
  const { verdict, parseError } = parseJudgeVerdict(parsed.assistantText);
  const failed = processResult.exitCode !== 0 || Boolean(processResult.error) || !verdict;
  const judgment: Judgment = {
    schemaVersion: 1,
    judgmentId: task.judgmentId,
    promptVersion: JUDGE_PROMPT_VERSION,
    createdAt: new Date().toISOString(),
    status: failed ? "failed" : "succeeded",
    pair: task.pair,
    round: task.round,
    candidateSlot: task.candidateSlot,
    judge: task.judge,
    outputIds: task.outputIds,
    lengthDeltaChars: options.lengthDeltaChars,
    verdict,
    parseError,
    rawText: parsed.assistantText,
    wallTimeMs: round(wallTimeMs, 1),
    usage: parsed.usage,
    error: processResult.error ?? (processResult.exitCode === 0 ? null : `judge exited with code ${processResult.exitCode}`),
  };
  await mkdir(options.judgmentsDir, { recursive: true });
  await writeFile(judgmentPath(options.judgmentsDir, task.judgmentId), `${JSON.stringify(judgment, null, 2)}\n`, "utf8");
  return judgment;
}

export async function loadJudgments(judgmentsDir: string): Promise<Judgment[]> {
  let names: string[];
  try {
    names = await readdir(judgmentsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const judgments: Judgment[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(judgmentsDir, name), "utf8")) as Judgment;
    if (value.schemaVersion === 1 && value.judgmentId && value.pair) judgments.push(value);
  }
  return judgments;
}

export type PairCombined = "PASS" | "FAIL" | "INCONSISTENT" | "UNKNOWN";
export type PairOutcome =
  | "win"
  | "tie"
  | "loss"
  | "inconsistent"
  | "both_fail"
  | "candidate_only_fail"
  | "control_only_fail"
  | "gates_inconsistent"
  | "incomplete";

export interface ReconciledPair {
  pair: JudgePair;
  rounds: number;
  candidate: PairCombined;
  control: PairCombined;
  outcome: PairOutcome;
  flags: string[];
  catastrophic: boolean;
  lengthDeltaChars: number;
}

function combine(values: GateVerdict[]): PairCombined {
  if (values.length < 2) return "UNKNOWN";
  if (values.every((value) => value === "PASS")) return "PASS";
  if (values.every((value) => value === "FAIL")) return "FAIL";
  if (values.some((value) => value === "UNJUDGEABLE")) return "UNKNOWN";
  return "INCONSISTENT";
}

/** Maps a judge label to the candidate's perspective given which slot the candidate held. */
export function candidateDirection(label: ReadabilityLabel, slot: "A" | "B"): "win" | "tie" | "loss" {
  if (label === "tie") return "tie";
  const favoursA = label.startsWith("A_");
  return favoursA === (slot === "A") ? "win" : "loss";
}

export function reconcilePairs(judgments: Judgment[]): ReconciledPair[] {
  const byPair = new Map<string, Judgment[]>();
  for (const judgment of judgments) {
    byPair.set(judgment.pair.pairKey, [...(byPair.get(judgment.pair.pairKey) ?? []), judgment]);
  }
  const reconciled: ReconciledPair[] = [];
  for (const group of byPair.values()) {
    const rounds = [0, 1].map((round) => group.find((item) => item.round === round && item.verdict));
    const usable = rounds.filter((item): item is Judgment => Boolean(item));
    const first = group[0]!;
    const flags = [...new Set(usable.flatMap((item) => item.verdict?.flags ?? []))];
    const base = {
      pair: first.pair,
      rounds: usable.length,
      flags,
      catastrophic: flags.some((flag) => CATASTROPHIC_FLAG.test(flag)),
      lengthDeltaChars: first.lengthDeltaChars,
    };
    if (usable.length < 2) {
      reconciled.push({ ...base, candidate: "UNKNOWN", control: "UNKNOWN", outcome: "incomplete" });
      continue;
    }
    const gatesFor = (role: "candidate" | "control", gate: "correctness" | "completion"): GateVerdict[] =>
      usable.map((item) => {
        const slot = role === "candidate"
          ? item.candidateSlot
          : (item.candidateSlot === "A" ? "B" : "A");
        return item.verdict!.gates[slot][gate];
      });
    const candidate = combine([...gatesFor("candidate", "correctness"), ...gatesFor("candidate", "completion")]);
    const control = combine([...gatesFor("control", "correctness"), ...gatesFor("control", "completion")]);
    let outcome: PairOutcome;
    if (candidate === "PASS" && control === "PASS") {
      const directions = usable.map((item) =>
        item.verdict!.readability ? candidateDirection(item.verdict!.readability, item.candidateSlot) : null);
      const [firstDirection, secondDirection] = directions;
      outcome = firstDirection && firstDirection === secondDirection ? firstDirection : "inconsistent";
    } else if (candidate === "FAIL" && control === "FAIL") outcome = "both_fail";
    else if (candidate === "FAIL") outcome = "candidate_only_fail";
    else if (control === "FAIL") outcome = "control_only_fail";
    else outcome = "gates_inconsistent";
    reconciled.push({ ...base, candidate, control, outcome });
  }
  return reconciled.sort((a, b) => a.pair.pairKey.localeCompare(b.pair.pairKey));
}

export function wilsonInterval(successes: number, total: number, z = 1.96): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 1 };
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = proportion + (z * z) / (2 * total);
  const spread = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * total)) / total);
  return {
    low: round(Math.max(0, (centre - spread) / denominator), 4),
    high: round(Math.min(1, (centre + spread) / denominator), 4),
  };
}

export interface PairwiseStats {
  scope: string;
  key: string;
  variantId: string;
  pairs: number;
  wins: number;
  ties: number;
  losses: number;
  inconsistent: number;
  bothFail: number;
  candidateOnlyFail: number;
  controlOnlyFail: number;
  gatesInconsistent: number;
  incomplete: number;
  decisive: number;
  orderConsistencyRate: number | null;
  tieAdjustedWinRate: number | null;
  wilson: { low: number; high: number } | null;
  meanLengthDeltaChars: number;
  winRateWhenLonger: number | null;
  winRateWhenShorter: number | null;
}

function pairwiseStats(scope: string, key: string, variantId: string, pairs: ReconciledPair[]): PairwiseStats {
  const count = (outcome: PairOutcome): number => pairs.filter((pair) => pair.outcome === outcome).length;
  const wins = count("win");
  const ties = count("tie");
  const losses = count("loss");
  const decisive = wins + ties + losses;
  const bothPass = decisive + count("inconsistent");
  const longer = pairs.filter((pair) => pair.lengthDeltaChars > 0 && ["win", "tie", "loss"].includes(pair.outcome));
  const shorter = pairs.filter((pair) => pair.lengthDeltaChars <= 0 && ["win", "tie", "loss"].includes(pair.outcome));
  const tieAdjusted = (subset: ReconciledPair[]): number | null => {
    const w = subset.filter((pair) => pair.outcome === "win").length;
    const t = subset.filter((pair) => pair.outcome === "tie").length;
    return subset.length ? round((w + 0.5 * t) / subset.length, 4) : null;
  };
  return {
    scope,
    key,
    variantId,
    pairs: pairs.length,
    wins,
    ties,
    losses,
    inconsistent: count("inconsistent"),
    bothFail: count("both_fail"),
    candidateOnlyFail: count("candidate_only_fail"),
    controlOnlyFail: count("control_only_fail"),
    gatesInconsistent: count("gates_inconsistent"),
    incomplete: count("incomplete"),
    decisive,
    orderConsistencyRate: bothPass ? round(decisive / bothPass, 4) : null,
    tieAdjustedWinRate: tieAdjusted(pairs.filter((pair) => ["win", "tie", "loss"].includes(pair.outcome))),
    wilson: decisive ? wilsonInterval(wins + 0.5 * ties, decisive) : null,
    meanLengthDeltaChars: pairs.length
      ? round(pairs.reduce((sum, pair) => sum + pair.lengthDeltaChars, 0) / pairs.length, 1)
      : 0,
    winRateWhenLonger: tieAdjusted(longer),
    winRateWhenShorter: tieAdjusted(shorter),
  };
}

export interface GateRate {
  model: string;
  language: string;
  variantId: string;
  responses: number;
  pass: number;
  fail: number;
  inconsistent: number;
  unknown: number;
  passRate: number | null;
}

function gateRates(pairs: ReconciledPair[]): GateRate[] {
  const rows = new Map<string, { model: string; language: string; variantId: string; verdicts: PairCombined[] }>();
  const seenControl = new Set<string>();
  const add = (model: string, language: string, variantId: string, verdict: PairCombined): void => {
    const key = [model, language, variantId].join("|");
    const row = rows.get(key) ?? { model, language, variantId, verdicts: [] };
    row.verdicts.push(verdict);
    rows.set(key, row);
  };
  for (const pair of pairs) {
    add(pair.pair.model, pair.pair.language, pair.pair.variantId, pair.candidate);
    if (!seenControl.has(pair.pair.controlRunId)) {
      seenControl.add(pair.pair.controlRunId);
      add(pair.pair.model, pair.pair.language, CONTROL_VARIANT_ID, pair.control);
    }
  }
  return [...rows.values()].map((row) => {
    const pass = row.verdicts.filter((verdict) => verdict === "PASS").length;
    const fail = row.verdicts.filter((verdict) => verdict === "FAIL").length;
    const decided = pass + fail;
    return {
      model: row.model,
      language: row.language,
      variantId: row.variantId,
      responses: row.verdicts.length,
      pass,
      fail,
      inconsistent: row.verdicts.filter((verdict) => verdict === "INCONSISTENT").length,
      unknown: row.verdicts.filter((verdict) => verdict === "UNKNOWN").length,
      passRate: decided ? round(pass / decided, 4) : null,
    };
  }).sort((a, b) =>
    a.model.localeCompare(b.model) || a.language.localeCompare(b.language) || a.variantId.localeCompare(b.variantId));
}

export interface OperationalRow {
  model: string;
  language: string;
  variantId: string;
  runs: number;
  medianOutputTokens: number;
  p90OutputTokens: number;
  medianWallTimeMs: number;
  p90WallTimeMs: number;
  outputTokenDeltaPct: number | null;
  wallTimeDeltaPct: number | null;
}

function operationalRows(results: RunResult[], filter?: (result: RunResult) => boolean): OperationalRow[] {
  const groups = new Map<string, RunResult[]>();
  for (const result of results) {
    if (result.status !== "succeeded") continue;
    if (filter && !filter(result)) continue;
    const key = [result.spec.model, result.spec.language, result.spec.variantId].join("|");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const stats = new Map<string, { tokens: number; wall: number }>();
  const rows: OperationalRow[] = [];
  for (const [key, runs] of groups) {
    const tokens = runs.map((run) => run.usage.output);
    const wall = runs.map((run) => run.wallTimeMs);
    stats.set(key, { tokens: median(tokens), wall: median(wall) });
    const [model = "", language = "", variantId = ""] = key.split("|");
    rows.push({
      model,
      language,
      variantId,
      runs: runs.length,
      medianOutputTokens: round(median(tokens), 1),
      p90OutputTokens: round(percentile(tokens, 0.9), 1),
      medianWallTimeMs: round(median(wall), 1),
      p90WallTimeMs: round(percentile(wall, 0.9), 1),
      outputTokenDeltaPct: null,
      wallTimeDeltaPct: null,
    });
  }
  for (const row of rows) {
    if (row.variantId === CONTROL_VARIANT_ID) continue;
    const control = stats.get([row.model, row.language, CONTROL_VARIANT_ID].join("|"));
    if (!control) continue;
    row.outputTokenDeltaPct = percentChange(median(
      groups.get([row.model, row.language, row.variantId].join("|"))!.map((run) => run.usage.output)), control.tokens);
    row.wallTimeDeltaPct = percentChange(median(
      groups.get([row.model, row.language, row.variantId].join("|"))!.map((run) => run.wallTimeMs)), control.wall);
  }
  return rows.sort((a, b) =>
    a.model.localeCompare(b.model) || a.language.localeCompare(b.language) || a.variantId.localeCompare(b.variantId));
}

export interface AcceptanceResult {
  variantId: string;
  stage: Stage;
  status: "advance" | "revise" | "reject" | "inconclusive";
  failures: string[];
  notes: string[];
}

function evaluateAcceptance(input: {
  variantId: string;
  stage: Stage;
  bars: Bars;
  pairs: ReconciledPair[];
  rates: GateRate[];
  operational: OperationalRow[];
  briefOperational: OperationalRow[];
  depthOperational: OperationalRow[];
  languageFidelityFailures: string[];
}): AcceptanceResult {
  const { variantId, stage, bars } = input;
  const failures: string[] = [];
  const notes: string[] = [];
  const blocking: string[] = [];

  const scored = input.pairs.filter((pair) => pair.pair.executionMode !== "multi_turn");
  const multiTurn = input.pairs.length - scored.length;
  if (multiTurn) notes.push(`${multiTurn} multi-turn pairs reported separately and excluded from pooled decisions (provisional harness)`);

  const catastrophic = scored.filter((pair) => pair.catastrophic);
  if (catastrophic.length) blocking.push(`${catastrophic.length} catastrophic-flag pair(s): ${[...new Set(catastrophic.map((pair) => pair.pair.caseId))].join(", ")}`);
  if (input.languageFidelityFailures.length) {
    blocking.push(`language fidelity failures: ${input.languageFidelityFailures.join(", ")}`);
  }

  const rateFor = (model: string, language: string, variant: string): number | null =>
    input.rates.find((row) => row.model === model && row.language === language && row.variantId === variant)?.passRate ?? null;
  const models = [...new Set(scored.map((pair) => pair.pair.model))];
  const languages = [...new Set(scored.map((pair) => pair.pair.language))];
  for (const model of models) {
    const pooled = (variant: string): number | null => {
      const rows = input.rates.filter((row) => row.model === model && row.variantId === variant);
      const pass = rows.reduce((sum, row) => sum + row.pass, 0);
      const decided = rows.reduce((sum, row) => sum + row.pass + row.fail, 0);
      return decided ? pass / decided : null;
    };
    const candidateRate = pooled(variantId);
    const controlRate = pooled(CONTROL_VARIANT_ID);
    if (candidateRate === null || controlRate === null) {
      notes.push(`no pooled gate rate for ${model}`);
      continue;
    }
    const drop = (controlRate - candidateRate) * 100;
    if (drop > bars.gateDropPooledPp) {
      blocking.push(`gate pass rate on ${model} is ${round(drop, 2)} pp below control (bar ${bars.gateDropPooledPp} pp)`);
    }
    for (const language of languages) {
      const cellCandidate = rateFor(model, language, variantId);
      const cellControl = rateFor(model, language, CONTROL_VARIANT_ID);
      if (cellCandidate === null || cellControl === null) continue;
      const cellDrop = (cellControl - cellCandidate) * 100;
      if (cellDrop > bars.gateDropCellPp) {
        blocking.push(`gate pass rate in ${model}/${language} is ${round(cellDrop, 2)} pp below control (bar ${bars.gateDropCellPp} pp)`);
      }
    }
  }

  const pooledStats = pairwiseStats("pooled", "all", variantId, scored);
  const repetition1 = scored.filter((pair) => pair.pair.repetition === 1);
  const covered = repetition1.filter((pair) => pair.outcome !== "incomplete").length;
  const coverage = repetition1.length ? covered / repetition1.length : 0;
  let inconclusive = false;
  if (coverage < bars.minRepetition1Coverage) {
    inconclusive = true;
    notes.push(`repetition-1 judging coverage ${round(coverage, 3)} below ${bars.minRepetition1Coverage}`);
  }
  if (pooledStats.decisive < bars.minDecisivePairs) {
    inconclusive = true;
    notes.push(`${pooledStats.decisive} order-consistent decisive pairs, below ${bars.minDecisivePairs}`);
  }

  if (pooledStats.tieAdjustedWinRate !== null && pooledStats.tieAdjustedWinRate < bars.tieAdjustedPooled) {
    failures.push(`pooled tie-adjusted win rate ${pooledStats.tieAdjustedWinRate} below ${bars.tieAdjustedPooled}`);
  }
  if (pooledStats.orderConsistencyRate !== null && pooledStats.orderConsistencyRate < bars.orderConsistencyRate) {
    failures.push(`order-consistency rate ${pooledStats.orderConsistencyRate} below ${bars.orderConsistencyRate}`);
  }
  if (bars.requireWilsonLowerBoundAbove !== null && pooledStats.wilson
    && pooledStats.wilson.low <= bars.requireWilsonLowerBoundAbove) {
    failures.push(`Wilson lower bound ${pooledStats.wilson.low} not above ${bars.requireWilsonLowerBoundAbove}`);
  }
  for (const language of languages) {
    const stats = pairwiseStats("language", language, variantId, scored.filter((pair) => pair.pair.language === language));
    if (stats.tieAdjustedWinRate !== null && stats.tieAdjustedWinRate < bars.tieAdjustedPerLanguage) {
      failures.push(`tie-adjusted win rate in ${language} is ${stats.tieAdjustedWinRate}, below ${bars.tieAdjustedPerLanguage}`);
    }
  }
  for (const model of models) {
    const stats = pairwiseStats("model", model, variantId, scored.filter((pair) => pair.pair.model === model));
    if (stats.tieAdjustedWinRate !== null && stats.tieAdjustedWinRate < bars.tieAdjustedPerModel) {
      failures.push(`tie-adjusted win rate on ${model} is ${stats.tieAdjustedWinRate}, below ${bars.tieAdjustedPerModel}`);
    }
  }

  for (const row of input.operational.filter((item) => item.variantId === variantId)) {
    if (row.outputTokenDeltaPct !== null && row.outputTokenDeltaPct > bars.outputTokenIncreasePct) {
      failures.push(`median output tokens in ${row.model}/${row.language} up ${row.outputTokenDeltaPct}% (bar ${bars.outputTokenIncreasePct}%)`);
    }
    if (row.wallTimeDeltaPct !== null && row.wallTimeDeltaPct > bars.wallTimeIncreasePct) {
      failures.push(`median wall time in ${row.model}/${row.language} up ${row.wallTimeDeltaPct}% (bar ${bars.wallTimeIncreasePct}%)`);
    }
  }
  for (const row of input.briefOperational.filter((item) => item.variantId === variantId)) {
    if (row.outputTokenDeltaPct !== null && row.outputTokenDeltaPct > bars.briefOutputTokenIncreasePct) {
      failures.push(`brief-case output tokens in ${row.model}/${row.language} up ${row.outputTokenDeltaPct}% (bar ${bars.briefOutputTokenIncreasePct}%)`);
    }
  }
  for (const row of input.depthOperational.filter((item) => item.variantId === variantId)) {
    if (row.outputTokenDeltaPct !== null && row.outputTokenDeltaPct < (bars.depthTokenRetention - 1) * 100) {
      failures.push(`long-form/architecture output tokens in ${row.model}/${row.language} at ${round(100 + row.outputTokenDeltaPct, 1)}% of control (bar ${bars.depthTokenRetention * 100}%)`);
    }
  }

  const status: AcceptanceResult["status"] = blocking.length
    ? "reject"
    : inconclusive
      ? "inconclusive"
      : failures.length
        ? "revise"
        : "advance";
  return { variantId, stage, status, failures: [...blocking, ...failures], notes };
}

export interface Analysis {
  schemaVersion: 1;
  generatedAt: string;
  stage: Stage;
  judgePromptVersion: string;
  bars: Bars;
  coverage: {
    runs: number;
    succeededRuns: number;
    pairsAvailable: number;
    pairsJudged: number;
    judgments: number;
    failedJudgments: number;
    unparsedJudgments: number;
  };
  gateRates: GateRate[];
  pairwise: PairwiseStats[];
  operational: OperationalRow[];
  presentation: Array<{ model: string; language: string; variantId: string; pairs: number; delta: ReturnType<typeof meanMetricsDelta> }>;
  languageFidelity: Array<{ model: string; language: string; variantId: string; runs: number; failures: string[] }>;
  provisional: { multiTurnPairs: number; note: string };
  acceptance: AcceptanceResult[];
}

export function buildAnalysis(input: {
  results: RunResult[];
  judgments: Judgment[];
  stage: Stage;
}): Analysis {
  const { results, judgments, stage } = input;
  const bars = EXPLORATORY_BARS[stage];
  const runsById = new Map(results.map((result) => [result.runId, result]));
  const reconciled = reconcilePairs(judgments);
  const variants = [...new Set(results.map((result) => result.spec.variantId))]
    .filter((variantId) => variantId !== CONTROL_VARIANT_ID)
    .sort();

  const rates = gateRates(reconciled);
  const operational = operationalRows(results);
  const briefOperational = operationalRows(results, (result) => BRIEF_CATEGORIES.has(result.spec.category));
  const depthOperational = operationalRows(results, (result) => DEPTH_CATEGORIES.has(result.spec.category));

  const pairwise: PairwiseStats[] = [];
  const presentation: Analysis["presentation"] = [];
  for (const variantId of variants) {
    const variantPairs = reconciled.filter((pair) => pair.pair.variantId === variantId && pair.pair.executionMode !== "multi_turn");
    pairwise.push(pairwiseStats("pooled", "all", variantId, variantPairs));
    for (const model of [...new Set(variantPairs.map((pair) => pair.pair.model))].sort()) {
      pairwise.push(pairwiseStats("model", model, variantId, variantPairs.filter((pair) => pair.pair.model === model)));
    }
    for (const language of [...new Set(variantPairs.map((pair) => pair.pair.language))].sort()) {
      pairwise.push(pairwiseStats("language", language, variantId, variantPairs.filter((pair) => pair.pair.language === language)));
    }
    for (const category of [...new Set(variantPairs.map((pair) => pair.pair.category))].sort()) {
      pairwise.push(pairwiseStats("category", category, variantId, variantPairs.filter((pair) => pair.pair.category === category)));
    }
    pairwise.push(pairwiseStats(
      "execution_mode",
      "multi_turn_provisional",
      variantId,
      reconciled.filter((pair) => pair.pair.variantId === variantId && pair.pair.executionMode === "multi_turn"),
    ));
  }

  // Deterministic presentation deltas, grouped by language: scales are not comparable across languages.
  const metricPairs = new Map<string, Array<{ candidate: ReturnType<typeof computePresentationMetrics>; control: ReturnType<typeof computePresentationMetrics> }>>();
  const allPairs = buildPairs(results);
  for (const pair of allPairs) {
    const candidate = runsById.get(pair.candidateRunId);
    const control = runsById.get(pair.controlRunId);
    if (!candidate || !control) continue;
    const key = [pair.model, pair.language, pair.variantId].join("|");
    metricPairs.set(key, [...(metricPairs.get(key) ?? []), {
      candidate: computePresentationMetrics(candidate.assistantText, pair.language),
      control: computePresentationMetrics(control.assistantText, pair.language),
    }]);
  }
  for (const [key, entries] of [...metricPairs].sort(([a], [b]) => a.localeCompare(b))) {
    const [model = "", language = "", variantId = ""] = key.split("|");
    presentation.push({ model, language, variantId, pairs: entries.length, delta: meanMetricsDelta(entries) });
  }

  const fidelityGroups = new Map<string, { model: string; language: string; variantId: string; runs: number; failures: string[] }>();
  for (const result of results) {
    if (result.status !== "succeeded" || !result.assistantText.trim()) continue;
    const key = [result.spec.model, result.spec.language, result.spec.variantId].join("|");
    const row = fidelityGroups.get(key)
      ?? { model: result.spec.model, language: result.spec.language, variantId: result.spec.variantId, runs: 0, failures: [] };
    row.runs += 1;
    const metrics = computePresentationMetrics(result.assistantText, result.spec.language);
    if (!metrics.languageFidelity.ok) row.failures.push(result.spec.caseId);
    fidelityGroups.set(key, row);
  }
  const languageFidelity = [...fidelityGroups.values()].sort((a, b) =>
    a.model.localeCompare(b.model) || a.language.localeCompare(b.language) || a.variantId.localeCompare(b.variantId));

  const acceptance = variants.map((variantId) => evaluateAcceptance({
    variantId,
    stage,
    bars,
    pairs: reconciled.filter((pair) => pair.pair.variantId === variantId),
    rates,
    operational,
    briefOperational,
    depthOperational,
    languageFidelityFailures: languageFidelity
      .filter((row) => row.variantId === variantId && row.language === "es" && row.failures.length)
      .flatMap((row) => row.failures),
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stage,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    bars,
    coverage: {
      runs: results.length,
      succeededRuns: results.filter((result) => result.status === "succeeded").length,
      pairsAvailable: allPairs.length,
      pairsJudged: reconciled.filter((pair) => pair.outcome !== "incomplete").length,
      judgments: judgments.length,
      failedJudgments: judgments.filter((judgment) => judgment.status === "failed").length,
      unparsedJudgments: judgments.filter((judgment) => !judgment.verdict).length,
    },
    gateRates: rates,
    pairwise,
    operational,
    presentation,
    languageFidelity,
    provisional: {
      multiTurnPairs: reconciled.filter((pair) => pair.pair.executionMode === "multi_turn").length,
      note: "Multi-turn cases are delivered as one structured prompt (Pi JSON mode is one-shot); they are reported separately and excluded from pooled acceptance decisions.",
    },
    acceptance,
  };
}
