import type { Datasheet } from "./datasheet.js";
import { slugifyModelId } from "./modelSlug.js";
import type { BifrostModel } from "./types.js";

const DEFAULT_MAX_INPUT_TOKENS = 4096;

type Modality = "text" | "audio" | "image" | "video" | "pdf";

/** The subset of opencode's `provider.<id>.models.<id>` config shape this plugin populates. */
export interface ProviderModelConfig {
  name?: string;
  temperature?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  limit?: { context: number; output: number };
  modalities?: { input: Modality[]; output: Modality[] };
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
}

type ContextSizeSource = "bifrost" | "sibling" | "datasheet" | "override" | "default";
type ResolvedContextSize =
  | { maxInputTokens: number; source: "sibling"; sourceFamily: string }
  | { maxInputTokens: number; source: Exclude<ContextSizeSource, "sibling"> };

interface SiblingContextEntry {
  maxInputTokens: number;
  family: string;
}

export function modelFamily(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/")[0] : modelId;
}

/** Maps each base model name to the best context size any provider in this fetch reported directly. */
export function buildSiblingContextIndex(models: readonly BifrostModel[]): Map<string, SiblingContextEntry> {
  const index = new Map<string, SiblingContextEntry>();
  for (const model of models) {
    const maxInputTokens = model.max_input_tokens ?? model.context_length;
    if (!maxInputTokens) {
      continue;
    }
    const slug = slugifyModelId(model.id);
    const existing = index.get(slug);
    if (!existing || maxInputTokens > existing.maxInputTokens) {
      index.set(slug, { maxInputTokens, family: modelFamily(model.id) });
    }
  }
  return index;
}

async function resolveMaxInputTokens(
  model: BifrostModel,
  family: string,
  overrides: Record<string, number>,
  siblingContext: Map<string, SiblingContextEntry>,
  datasheet: Datasheet,
): Promise<ResolvedContextSize> {
  if (model.max_input_tokens) {
    return { maxInputTokens: model.max_input_tokens, source: "bifrost" };
  }
  if (model.context_length) {
    return { maxInputTokens: model.context_length, source: "bifrost" };
  }

  const sibling = siblingContext.get(slugifyModelId(model.id));
  if (sibling) {
    return { maxInputTokens: sibling.maxInputTokens, source: "sibling", sourceFamily: sibling.family };
  }

  const fromDatasheet = await datasheet.lookup(model.id);
  if (fromDatasheet) {
    return { maxInputTokens: fromDatasheet, source: "datasheet" };
  }

  const override = overrides[model.id] ?? overrides[family];
  if (override !== undefined) {
    return { maxInputTokens: override, source: "override" };
  }

  return { maxInputTokens: DEFAULT_MAX_INPUT_TOKENS, source: "default" };
}

/** Resolves one Bifrost model's context size and capabilities, independent of opencode's API version. */
export async function resolveModel(
  model: BifrostModel,
  overrides: Record<string, number>,
  siblingContext: Map<string, SiblingContextEntry>,
  datasheet: Datasheet,
): Promise<ResolvedModel> {
  const family = modelFamily(model.id);
  const resolved = await resolveMaxInputTokens(model, family, overrides, siblingContext, datasheet);
  const maxInputTokens = resolved.maxInputTokens;

  // Bifrost only carries rich catalog metadata (supported_parameters, etc.) for some providers
  // (e.g. its OpenRouter passthrough). When it's simply absent, assume tool calling works rather
  // than hiding the model, since opencode's agent/edit tooling filters on this capability.
  const toolCall = model.supported_parameters
    ? model.supported_parameters.some((p) => p === "tools" || p === "tool_choice")
    : true;

  return {
    id: model.id,
    name: model.name ?? model.id,
    maxInputTokens,
    maxOutputTokens: model.max_output_tokens ?? Math.min(maxInputTokens, 4096),
    toolCall,
    imageInput: model.architecture?.input_modalities?.includes("image") ?? false,
  };
}

/** Resolves every discovered Bifrost model, cross-referencing context sizes across providers. */
export async function resolveModels(
  models: readonly BifrostModel[],
  overrides: Record<string, number>,
  datasheet: Datasheet,
): Promise<ResolvedModel[]> {
  const siblingContext = buildSiblingContextIndex(models);
  return Promise.all(models.map((model) => resolveModel(model, overrides, siblingContext, datasheet)));
}

/** Converts a single Bifrost model into opencode v1's provider-config model shape. */
export async function toProviderModel(
  model: BifrostModel,
  overrides: Record<string, number>,
  siblingContext: Map<string, SiblingContextEntry>,
  datasheet: Datasheet,
): Promise<ProviderModelConfig> {
  return toProviderModelConfig(await resolveModel(model, overrides, siblingContext, datasheet));
}

/** Formats a resolved model for opencode v1's `provider.<id>.models.<id>` config. */
export function toProviderModelConfig(resolved: ResolvedModel): ProviderModelConfig {
  return {
    name: resolved.name,
    temperature: true,
    reasoning: false,
    tool_call: resolved.toolCall,
    attachment: resolved.imageInput,
    limit: { context: resolved.maxInputTokens, output: resolved.maxOutputTokens },
    modalities: {
      input: resolved.imageInput ? ["text", "image"] : ["text"],
      output: ["text"] as Modality[],
    },
  };
}

/** Converts every discovered Bifrost model into opencode v1's `provider.bifrost.models` map. */
export async function toProviderModels(
  models: readonly BifrostModel[],
  overrides: Record<string, number>,
  datasheet: Datasheet,
): Promise<Record<string, ProviderModelConfig>> {
  const resolved = await resolveModels(models, overrides, datasheet);
  return Object.fromEntries(resolved.map((model) => [model.id, toProviderModelConfig(model)]));
}
