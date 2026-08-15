export interface EvaluationSuite {
  schema_version: string;
  suite_id: string;
  cases: EvaluationCase[];
}

export interface EvaluationCase {
  id: string;
  pair_id?: string;
  language: string;
  category: string;
  execution_mode: "single_turn" | "multi_turn" | "agent_workspace";
  prompt?: string;
  turns?: Array<{ role: string; content: string }>;
  workspace_fixture?: { files: Record<string, string> };
  [key: string]: unknown;
}

export interface ModelTarget {
  provider: string;
  model: string;
}

export interface PromptVariant {
  id: string;
  path: string;
  text: string;
  sha256: string;
}

export interface RunSpec {
  schemaVersion: 1;
  suiteId: string;
  suiteVersion: string;
  provider: string;
  model: string;
  variantId: string;
  variantSha256: string;
  caseId: string;
  caseSha256: string;
  language: string;
  category: string;
  executionMode: EvaluationCase["execution_mode"];
  repetition: number;
  candidateText: string;
  casePrompt: string;
  fixture?: Record<string, string>;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  calls: number;
}

export interface FileSnapshot {
  path: string;
  bytes: number;
  sha256: string;
  content: string;
}

export interface RunResult {
  schemaVersion: 1;
  runId: string;
  status: "succeeded" | "failed";
  spec: Omit<RunSpec, "candidateText" | "fixture">;
  command: { executable: string; args: string[]; cwd: string };
  startedAt: string;
  endedAt: string;
  wallTimeMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  parsedEventCount: number;
  malformedJsonLines: number;
  assistantText: string;
  usage: Usage;
  workspace?: { before: FileSnapshot[]; after: FileSnapshot[] };
  error?: string;
}

export interface SummaryGroup {
  provider: string;
  model: string;
  variantId: string;
  language: string;
  runs: number;
  succeeded: number;
  failed: number;
  wallTimeMs: { mean: number; p50: number; p95: number };
  assistantChars: { mean: number };
  usage: Usage;
}
