import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunResult, SummaryGroup, Usage } from "./types.js";

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1] ?? 0;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function aggregateResults(results: RunResult[]): SummaryGroup[] {
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const key = [result.spec.provider, result.spec.model, result.spec.variantId, result.spec.language].join("\0");
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }
  return [...grouped.values()].map((runs) => {
    const first = runs[0]!;
    const usage = runs.reduce<Usage>((total, run) => ({
      input: total.input + run.usage.input,
      output: total.output + run.usage.output,
      cacheRead: total.cacheRead + run.usage.cacheRead,
      cacheWrite: total.cacheWrite + run.usage.cacheWrite,
      totalTokens: total.totalTokens + run.usage.totalTokens,
      cost: total.cost + run.usage.cost,
      calls: total.calls + run.usage.calls,
    }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, calls: 0 });
    const wallTimes = runs.map((run) => run.wallTimeMs);
    return {
      provider: first.spec.provider,
      model: first.spec.model,
      variantId: first.spec.variantId,
      language: first.spec.language,
      runs: runs.length,
      succeeded: runs.filter((run) => run.status === "succeeded").length,
      failed: runs.filter((run) => run.status === "failed").length,
      wallTimeMs: {
        mean: rounded(mean(wallTimes)),
        p50: rounded(percentile(wallTimes, 0.5)),
        p95: rounded(percentile(wallTimes, 0.95)),
      },
      assistantChars: { mean: rounded(mean(runs.map((run) => run.assistantText.length))) },
      usage: { ...usage, cost: rounded(usage.cost) },
    };
  }).sort((a, b) =>
    a.provider.localeCompare(b.provider) ||
    a.model.localeCompare(b.model) ||
    a.variantId.localeCompare(b.variantId) ||
    a.language.localeCompare(b.language));
}

export async function loadResults(resultsDir: string): Promise<RunResult[]> {
  let names: string[];
  try {
    names = await readdir(resultsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results: RunResult[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(resultsDir, name), "utf8")) as RunResult;
    if (value.schemaVersion === 1 && value.runId && value.spec) results.push(value);
  }
  return results;
}

export async function createSummary(resultsDir: string, output?: string): Promise<object> {
  const results = await loadResults(resultsDir);
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    resultsDir,
    totalRuns: results.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    failed: results.filter((result) => result.status === "failed").length,
    groups: aggregateResults(results),
  };
  if (output) await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}
