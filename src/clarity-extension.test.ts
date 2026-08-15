import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  composeSystemPrompt,
  formatStatus,
  loadPromptContracts,
  resolvePromptPath,
  selectContract,
  setEnabled,
  type ClarityState,
} from "../extensions/clarity-core.js";

const extensionUrl = new URL("../extensions/clarity.ts", import.meta.url).href;

test("selects strong only for gpt-5.6-sol by model id", () => {
  assert.equal(selectContract({ id: "gpt-5.6-sol" }), "strong");
  assert.equal(selectContract({ id: "claude-opus-5" }), "balanced");
});

test("falls back to balanced for unknown or missing models", () => {
  assert.equal(selectContract({ id: "future-model" }), "balanced");
  assert.equal(selectContract(undefined), "balanced");
});

test("loads contract text from the repository prompt files", () => {
  const contracts = loadPromptContracts(extensionUrl);

  assert.equal(contracts.strong, readFileSync(resolvePromptPath(extensionUrl, "strong"), "utf8").trim());
  assert.equal(contracts.balanced, readFileSync(resolvePromptPath(extensionUrl, "balanced"), "utf8").trim());
});

test("appends the contract without replacing the existing system prompt", () => {
  const original = "Pi system prompt\nwith existing instructions.";
  const contract = "Presentation contract.";
  const composed = composeSystemPrompt(original, contract);

  assert.equal(composed, `${original}\n\n${contract}`);
  assert.ok(composed.startsWith(original));
});

test("toggle state defaults on and status records provider, model, and contract", () => {
  const state: ClarityState = {
    enabled: true,
    model: { provider: "cliproxy-codex", id: "gpt-5.6-sol" },
  };

  assert.equal(formatStatus(state), "Clarity on · strong · cliproxy-codex/gpt-5.6-sol");
  setEnabled(state, false);
  assert.equal(formatStatus(state), "Clarity off · strong (inactive) · cliproxy-codex/gpt-5.6-sol");
});
