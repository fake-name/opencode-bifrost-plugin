import { Model, Provider } from "@opencode/plugin";
import type { ResolvedModel } from "./modelMapping.js";

type ProviderID = typeof Provider.ID.Type;
type ModelInfo = typeof Model.Info.Type;

/**
 * Formats a resolved model as opencode v2's `Model.Info`. v2 replaced v1's loose per-model config
 * object with a schema, so what v1 carried as `tool_call`/`attachment`/`modalities` all lives under
 * `capabilities` here; everything else (cost, status, variants) keeps the schema's defaults.
 */
export function toModelInfo(providerID: ProviderID, resolved: ResolvedModel): ModelInfo {
  const base = Model.Info.default(providerID, Model.ID.make(resolved.id));
  return {
    ...base,
    name: resolved.name,
    capabilities: {
      tools: resolved.toolCall,
      input: resolved.imageInput ? ["text", "image"] : ["text"],
      output: ["text"],
    },
    limit: { context: resolved.maxInputTokens, output: resolved.maxOutputTokens },
  };
}
