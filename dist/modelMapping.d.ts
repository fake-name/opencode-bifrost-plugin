import type { Datasheet } from "./datasheet.js";
import type { BifrostModel } from "./types.js";
type Modality = "text" | "audio" | "image" | "video" | "pdf";
/** The subset of opencode's `provider.<id>.models.<id>` config shape this plugin populates. */
export interface ProviderModelConfig {
    name?: string;
    temperature?: boolean;
    reasoning?: boolean;
    variants?: Record<string, {
        reasoningEffort?: string;
        disabled?: boolean;
    }>;
    tool_call?: boolean;
    attachment?: boolean;
    limit?: {
        context: number;
        output: number;
    };
    modalities?: {
        input: Modality[];
        output: Modality[];
    };
}
/**
 * What this plugin knows about one Bifrost model once its context size and capabilities have been
 * resolved, before it is formatted for a particular opencode plugin API. opencode v1 and v2
 * describe models with different shapes, so both formatters start from this.
 */
export interface ResolvedModel {
    id: string;
    name: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    toolCall: boolean;
    imageInput: boolean;
    reasoningEfforts: string[];
}
/** Keep the routing id intact; only inspect its underlying model suffix for missing metadata. */
export declare function reasoningEfforts(model: BifrostModel): string[];
/** UI choices can differ from wire values: adaptive is a mode, not an effort. */
export declare function reasoningVariants(resolved: ResolvedModel): Record<string, {
    reasoningEffort?: string;
}>;
interface SiblingContextEntry {
    maxInputTokens: number;
    family: string;
}
export declare function modelFamily(modelId: string): string;
/**
 * Builds the picker label `{ProviderName}: {ModelName}` from a Bifrost id, so the same model served
 * by different providers can be told apart, e.g. "openrouter/anthropic/claude-haiku-5.5" becomes
 * "OpenRouter: claude-haiku-5.5". The model name is the id's last segment, with its case kept.
 */
export declare function modelDisplayName(modelId: string): string;
/** Maps each base model name to the best context size any provider in this fetch reported directly. */
export declare function buildSiblingContextIndex(models: readonly BifrostModel[]): Map<string, SiblingContextEntry>;
/** Resolves one Bifrost model's context size and capabilities, independent of opencode's API version. */
export declare function resolveModel(model: BifrostModel, overrides: Record<string, number>, siblingContext: Map<string, SiblingContextEntry>, datasheet: Datasheet): Promise<ResolvedModel>;
/** Resolves every discovered Bifrost model, cross-referencing context sizes across providers. */
export declare function resolveModels(models: readonly BifrostModel[], overrides: Record<string, number>, datasheet: Datasheet): Promise<ResolvedModel[]>;
/** Converts a single Bifrost model into opencode v1's provider-config model shape. */
export declare function toProviderModel(model: BifrostModel, overrides: Record<string, number>, siblingContext: Map<string, SiblingContextEntry>, datasheet: Datasheet): Promise<ProviderModelConfig>;
/** Formats a resolved model for opencode v1's `provider.<id>.models.<id>` config. */
export declare function toProviderModelConfig(resolved: ResolvedModel): ProviderModelConfig;
/** Converts every discovered Bifrost model into opencode v1's `provider.bifrost.models` map. */
export declare function toProviderModels(models: readonly BifrostModel[], overrides: Record<string, number>, datasheet: Datasheet): Promise<Record<string, ProviderModelConfig>>;
export {};
