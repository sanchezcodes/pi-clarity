import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  composeSystemPrompt,
  formatStatus,
  loadPromptContracts,
  selectContract,
  setEnabled,
  type ClarityState,
  type ModelIdentity,
} from "./clarity-core.js";

const STATE_ENTRY = "pi-clarify-state";
const STATUS_KEY = "pi-clarify";
const contracts = loadPromptContracts(import.meta.url);

function modelIdentity(model: ModelIdentity | undefined): ModelIdentity | undefined {
  return model ? { provider: model.provider, id: model.id } : undefined;
}

function restoreEnabled(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>): boolean {
  let enabled = true;

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    const data = entry.data as { enabled?: unknown } | undefined;
    if (typeof data?.enabled === "boolean") enabled = data.enabled;
  }

  return enabled;
}

export default function clarityExtension(pi: ExtensionAPI) {
  const state: ClarityState = { enabled: true, model: undefined };

  const updateStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus(STATUS_KEY, formatStatus(state));
  };

  pi.on("session_start", (_event, ctx) => {
    state.enabled = restoreEnabled(ctx.sessionManager.getBranch());
    state.model = modelIdentity(ctx.model);
    updateStatus(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    state.model = modelIdentity(event.model);
    updateStatus(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    state.model = modelIdentity(ctx.model);
    updateStatus(ctx);
    if (!state.enabled) return;

    const contract = selectContract(state.model);
    return {
      systemPrompt: composeSystemPrompt(event.systemPrompt, contracts[contract]),
    };
  });

  pi.registerCommand("clarity", {
    description: "Show or toggle the response-presentation contract for this session",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";

      if (action === "on" || action === "off") {
        const enabled = action === "on";
        if (state.enabled !== enabled) {
          setEnabled(state, enabled);
          pi.appendEntry(STATE_ENTRY, { enabled });
        }
      } else if (action !== "status") {
        ctx.ui.notify("Usage: /clarity [status|on|off]", "warning");
        return;
      }

      state.model = modelIdentity(ctx.model);
      updateStatus(ctx);
      ctx.ui.notify(formatStatus(state), "info");
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
