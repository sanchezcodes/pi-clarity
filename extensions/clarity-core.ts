import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ContractName = "strong" | "balanced";

export interface ModelIdentity {
  provider: string;
  id: string;
}

export interface ClarityState {
  enabled: boolean;
  model: ModelIdentity | undefined;
}

export type PromptContracts = Record<ContractName, string>;

export function selectContract(model: Pick<ModelIdentity, "id"> | undefined): ContractName {
  return model?.id === "gpt-5.6-sol" ? "strong" : "balanced";
}

export function resolvePromptPath(extensionModuleUrl: string, contract: ContractName): string {
  const extensionDirectory = dirname(fileURLToPath(extensionModuleUrl));
  return resolve(extensionDirectory, "..", "prompts", `${contract}.md`);
}

export function loadPromptContracts(extensionModuleUrl: string): PromptContracts {
  return {
    strong: readFileSync(resolvePromptPath(extensionModuleUrl, "strong"), "utf8").trim(),
    balanced: readFileSync(resolvePromptPath(extensionModuleUrl, "balanced"), "utf8").trim(),
  };
}

export function composeSystemPrompt(systemPrompt: string, contractText: string): string {
  return `${systemPrompt}\n\n${contractText}`;
}

export function setEnabled(state: ClarityState, enabled: boolean): void {
  state.enabled = enabled;
}

export function formatStatus(state: ClarityState): string {
  const contract = selectContract(state.model);
  const model = state.model ? `${state.model.provider}/${state.model.id}` : "no active model";
  const contractStatus = state.enabled ? contract : `${contract} (inactive)`;
  return `Clarity ${state.enabled ? "on" : "off"} · ${contractStatus} · ${model}`;
}
