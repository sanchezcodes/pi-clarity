import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { buildPiCommand, makeRunId, resultPath, sha256 } from "./core.js";
import type { FileSnapshot, RunResult, RunSpec, Usage } from "./types.js";

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, calls: 0 };

async function writeFixture(root: string, fixture: Record<string, string> | undefined): Promise<void> {
  for (const [file, content] of Object.entries(fixture ?? {})) {
    const path = resolve(root, file);
    if (!path.startsWith(`${resolve(root)}/`)) throw new Error(`Fixture path escapes workspace: ${file}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function snapshotWorkspace(root: string): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  for (const path of await listFiles(root)) {
    const content = await readFile(path);
    snapshots.push({
      path: relative(root, path),
      bytes: content.byteLength,
      sha256: sha256(content),
      content: content.toString("utf8"),
    });
  }
  return snapshots;
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFrom(value: unknown): Omit<Usage, "calls"> {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const costValue = usage.cost;
  const cost = typeof costValue === "number"
    ? costValue
    : number(costValue && typeof costValue === "object" ? (costValue as Record<string, unknown>).total : 0);
  return {
    input: number(usage.input),
    output: number(usage.output),
    cacheRead: number(usage.cacheRead),
    cacheWrite: number(usage.cacheWrite),
    totalTokens: number(usage.totalTokens),
    cost,
  };
}

function textFromMessage(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === "object")
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

export function parsePiOutput(stdout: string): {
  eventCount: number;
  malformedLines: number;
  assistantText: string;
  usage: Usage;
} {
  const aggregate: Usage = { ...EMPTY_USAGE };
  let assistantText = "";
  let eventCount = 0;
  let malformedLines = 0;
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
      eventCount += 1;
    } catch {
      malformedLines += 1;
      continue;
    }
    if (event.type !== "message_end" || !event.message || typeof event.message !== "object") continue;
    const message = event.message as Record<string, unknown>;
    if (message.role !== "assistant") continue;
    assistantText = textFromMessage(message) || assistantText;
    if (message.usage) {
      const current = usageFrom(message.usage);
      aggregate.input += current.input;
      aggregate.output += current.output;
      aggregate.cacheRead += current.cacheRead;
      aggregate.cacheWrite += current.cacheWrite;
      aggregate.totalTokens += current.totalTokens;
      aggregate.cost += current.cost;
      aggregate.calls += 1;
    }
  }
  return { eventCount, malformedLines, assistantText, usage: aggregate };
}

async function spawnPi(command: { executable: string; args: string[] }, cwd: string, timeoutMs: number): Promise<{
  stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null; error?: string;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn(command.executable, command.args, {
      cwd,
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
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const baseResult = { stdout, stderr, exitCode, signal };
      if (timedOut) resolvePromise({ ...baseResult, error: `Timed out after ${timeoutMs} ms` });
      else if (spawnError) resolvePromise({ ...baseResult, error: spawnError });
      else resolvePromise(baseResult);
    });
  });
}

export async function executeRun(spec: RunSpec, options: {
  resultsDir: string;
  piBin: string;
  timeoutMs: number;
}): Promise<RunResult> {
  const runId = makeRunId(spec);
  const workspace = join(options.resultsDir, "workspaces", runId);
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  await writeFixture(workspace, spec.fixture);
  const before = await snapshotWorkspace(workspace);
  const command = buildPiCommand(spec, options.piBin);
  const startedAt = new Date();
  const startedNs = process.hrtime.bigint();
  const processResult = await spawnPi(command, workspace, options.timeoutMs);
  const wallTimeMs = Number(process.hrtime.bigint() - startedNs) / 1_000_000;
  const endedAt = new Date();
  const after = await snapshotWorkspace(workspace);
  const parsed = parsePiOutput(processResult.stdout);
  const status = processResult.exitCode === 0 && !processResult.error ? "succeeded" : "failed";
  const { candidateText: _candidateText, fixture: _fixture, ...recordedSpec } = spec;
  const result: RunResult = {
    schemaVersion: 1,
    runId,
    status,
    spec: recordedSpec,
    command: { ...command, cwd: workspace },
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    wallTimeMs,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    parsedEventCount: parsed.eventCount,
    malformedJsonLines: parsed.malformedLines,
    assistantText: parsed.assistantText,
    usage: parsed.usage,
    workspace: { before, after },
    ...(processResult.error ? { error: processResult.error } : {}),
  };
  await mkdir(options.resultsDir, { recursive: true });
  await Promise.all([
    writeFile(resultPath(options.resultsDir, runId), `${JSON.stringify(result, null, 2)}\n`, "utf8"),
    writeFile(join(options.resultsDir, `${runId}.events.jsonl`), processResult.stdout, "utf8"),
    writeFile(join(options.resultsDir, `${runId}.stderr.log`), processResult.stderr, "utf8"),
  ]);
  return result;
}

export async function resultExists(resultsDir: string, runId: string): Promise<boolean> {
  try {
    return (await stat(resultPath(resultsDir, runId))).isFile();
  } catch {
    return false;
  }
}
