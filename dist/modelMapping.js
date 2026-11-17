import { slugifyModelId } from "./modelSlug.js";
const DEFAULT_MAX_INPUT_TOKENS = 4096;
const KNOWN_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const DEFAULT_EFFORTS = ["low", "medium", "high"];
const CLAUDE_55_EFFORTS = [...DEFAULT_EFFORTS, "xhigh", "max"];
const CLAUDE_55 = /(?:^|[./_-])claude-(?:opus|sonnet|haiku)-5[.-]5(?:-\d{8})?(?:-v\d+:\d+)?$/i;
/** Keep the routing id intact; only inspect its underlying model suffix for missing metadata. */
export function reasoningEfforts(model) {
    const advertised = model.reasoning?.supported_efforts;
    if (Array.isArray(advertised)) {
        // An explicit list, including an empty one, wins over name-based inference.
        return [...new Set(advertised
                .filter((effort) => typeof effort === "string")
                .map((effort) => effort.trim().toLowerCase())
                .filter((effort) => KNOWN_EFFORTS.has(effort)))];
    }
    // Native ids and generated aliases such as:
    // bedrock_mantle/opus-project-name-anthropic.claude-opus-5-5
    // Limit inference to the known 5.5 triplet, not all Claude or all gateway models.
    if (CLAUDE_55.test(model.id))
        return [...CLAUDE_55_EFFORTS];
    return model.supported_parameters?.includes("reasoning_effort") ? [...DEFAULT_EFFORTS] : [];
}
/** UI choices can differ from wire values: adaptive is a mode, not an effort. */
export function reasoningVariants(resolved) {
    const variants = {};
    if (CLAUDE_55.test(resolved.id) && resolved.reasoningEfforts.length > 0) {
        // Claude 5.5 defaults to adaptive thinking. Leave effort to the upstream default.
        variants.adaptive = {};
        // Match Maki's minimal choice without sending an unsupported Claude effort.
        if (resolved.reasoningEfforts.includes("low") && !resolved.reasoningEfforts.includes("minimal")) {
            variants.minimal = { reasoningEffort: "low" };
        }
    }
    for (const effort of resolved.reasoningEfforts)
        variants[effort] = { reasoningEffort: effort };
    return variants;
}
export function modelFamily(modelId) {
    return modelId.includes("/") ? modelId.split("/")[0] : modelId;
}
/**
 * Display names for Bifrost's built-in provider prefixes, as listed in its supported-providers docs
 * (https://docs.getbifrost.ai/providers/supported-providers/overview). Unknown prefixes, such as
 * custom providers, are shown as they appear in the id.
 */
const PROVIDER_LABELS = new Map([
    ["anthropic", "Anthropic"],
    ["azure", "Azure"],
    ["bedrock", "Bedrock"],
    ["bedrock_mantle", "Bedrock Mantle"],
    ["byteplus", "BytePlus"],
    ["cerebras", "Cerebras"],
    ["cloudflare", "Cloudflare"],
    ["cohere", "Cohere"],
    ["databricks", "Databricks"],
    ["deepseek", "DeepSeek"],
    ["elevenlabs", "Elevenlabs"],
    ["fireworks", "Fireworks"],
    ["gemini", "Gemini"],
    ["github-copilot", "GitHub Copilot"],
    ["groq", "Groq"],
    ["huggingface", "Hugging Face"],
    ["minimax", "MiniMax"],
    ["mistral", "Mistral"],
    ["nebius", "Nebius"],
    ["ollama", "Ollama"],
    ["openai", "OpenAI"],
    ["opencode-go", "OpenCode Go"],
    ["openrouter", "OpenRouter"],
    ["parasail", "Parasail"],
    ["perplexity", "Perplexity"],
    ["replicate", "Replicate"],
    ["runware", "Runware"],
    ["runway", "Runway"],
    ["sagemaker", "SageMaker"],
    ["sarvam", "Sarvam AI"],
    ["sgl", "SGL"],
    ["typesafe", "TypeSafe"],
    ["vertex", "Vertex AI"],
    ["vllm", "vLLM"],
    ["wafer", "Wafer"],
    ["xai", "xAI"],
]);
/**
 * Builds the picker label `{ProviderName}: {ModelName}` from a Bifrost id, so the same model served
 * by different providers can be told apart, e.g. "openrouter/anthropic/claude-haiku-5.5" becomes
 * "OpenRouter: claude-haiku-5.5". The model name is the id's last segment, with its case kept.
 */
export function modelDisplayName(modelId) {
    const slash = modelId.indexOf("/");
    if (slash === -1) {
        return modelId;
    }
    const provider = modelId.slice(0, slash);
    const modelName = modelId.slice(modelId.lastIndexOf("/") + 1);
    return `${PROVIDER_LABELS.get(provider) ?? provider}: ${modelName}`;
}
/** Maps each base model name to the best context size any provider in this fetch reported directly. */
export function buildSiblingContextIndex(models) {
    const index = new Map();
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
async function resolveMaxInputTokens(model, family, overrides, siblingContext, datasheet) {
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
export async function resolveModel(model, overrides, siblingContext, datasheet) {
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
        name: modelDisplayName(model.id),
        maxInputTokens,
        maxOutputTokens: model.max_output_tokens ?? Math.min(maxInputTokens, 4096),
        toolCall,
        imageInput: model.architecture?.input_modalities?.includes("image") ?? false,
        reasoningEfforts: reasoningEfforts(model),
    };
}
/** Resolves every discovered Bifrost model, cross-referencing context sizes across providers. */
export async function resolveModels(models, overrides, datasheet) {
    const siblingContext = buildSiblingContextIndex(models);
    return Promise.all(models.map((model) => resolveModel(model, overrides, siblingContext, datasheet)));
}
/** Converts a single Bifrost model into opencode v1's provider-config model shape. */
export async function toProviderModel(model, overrides, siblingContext, datasheet) {
    return toProviderModelConfig(await resolveModel(model, overrides, siblingContext, datasheet));
}
/** Formats a resolved model for opencode v1's `provider.<id>.models.<id>` config. */
export function toProviderModelConfig(resolved) {
    const variants = reasoningVariants(resolved);
    // v1 merges these with its own low/medium/high variants. Disable any that
    // Bifrost explicitly omitted, so unsupported choices cannot reappear in the UI.
    if (resolved.reasoningEfforts.length > 0) {
        for (const effort of DEFAULT_EFFORTS) {
            if (!(effort in variants))
                variants[effort] = { disabled: true };
        }
    }
    return {
        name: resolved.name,
        temperature: true,
        reasoning: resolved.reasoningEfforts.length > 0,
        variants,
        tool_call: resolved.toolCall,
        attachment: resolved.imageInput,
        limit: { context: resolved.maxInputTokens, output: resolved.maxOutputTokens },
        modalities: {
            input: resolved.imageInput ? ["text", "image"] : ["text"],
            output: ["text"],
        },
    };
}
/** Converts every discovered Bifrost model into opencode v1's `provider.bifrost.models` map. */
export async function toProviderModels(models, overrides, datasheet) {
    const resolved = await resolveModels(models, overrides, datasheet);
    return Object.fromEntries(resolved.map((model) => [model.id, toProviderModelConfig(model)]));
}
//# sourceMappingURL=modelMapping.js.map