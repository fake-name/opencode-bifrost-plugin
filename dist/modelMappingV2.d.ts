import { Model, Provider } from "@opencode/plugin";
import { type ResolvedModel } from "./modelMapping.js";
type ProviderID = typeof Provider.ID.Type;
type ModelInfo = typeof Model.Info.Type;
/**
 * Formats a resolved model as opencode v2's `Model.Info`. v2 replaced v1's loose per-model config
 * object with a schema, so what v1 carried as `tool_call`/`attachment`/`modalities` all lives under
 * `capabilities` here. Effort variants use v2's settings wrapper.
 */
export declare function toModelInfo(providerID: ProviderID, resolved: ResolvedModel): ModelInfo;
export {};
