import { Model } from "@opencode/plugin";
import { reasoningVariants } from "./modelMapping.js";
/**
 * Formats a resolved model as opencode v2's `Model.Info`. v2 replaced v1's loose per-model config
 * object with a schema, so what v1 carried as `tool_call`/`attachment`/`modalities` all lives under
 * `capabilities` here. Effort variants use v2's settings wrapper.
 */
export function toModelInfo(providerID, resolved) {
    const base = Model.Info.default(providerID, Model.ID.make(resolved.id));
    return {
        ...base,
        name: resolved.name,
        variants: Object.entries(reasoningVariants(resolved)).map(([id, settings]) => ({
            id: Model.VariantID.make(id),
            settings,
        })),
        capabilities: {
            tools: resolved.toolCall,
            input: resolved.imageInput ? ["text", "image"] : ["text"],
            output: ["text"],
        },
        limit: { context: resolved.maxInputTokens, output: resolved.maxOutputTokens },
    };
}
//# sourceMappingURL=modelMappingV2.js.map