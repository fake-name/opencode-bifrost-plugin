import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Datasheet } from "../src/datasheet.js";
import {
  buildSiblingContextIndex,
  modelDisplayName,
  modelFamily,
  reasoningEfforts,
  toProviderModel,
  toProviderModels,
} from "../src/modelMapping.js";
import type { BifrostModel } from "../src/types.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function tmpDatasheet() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bifrost-mapping-test-"));
  return new Datasheet(dir);
}

describe("modelFamily", () => {
  it("takes the first path segment when present", () => {
    expect(modelFamily("openai/gpt-4o")).toBe("openai");
  });

  it("falls back to the whole id with no provider prefix", () => {
    expect(modelFamily("gpt-4o")).toBe("gpt-4o");
  });
});

describe("reasoning effort discovery", () => {
  const allEfforts = ["low", "medium", "high", "xhigh", "max"];

  it.each(["opus", "sonnet", "haiku"])("recognizes %s 5.5 across arbitrary project aliases", async (family) => {
    const ids = ["project-a", "another-project-123", "sonnet-in-project-name"].map(
      (project) => `bedrock_mantle/${family}-${project}-anthropic.claude-${family}-5-5`,
    );
    const models = ids.map((id) => ({ id, context_length: 1_000_000, max_output_tokens: 128_000 }));
    const result = await toProviderModels(models, {}, await tmpDatasheet());
    expect(Object.keys(result)).toEqual(ids);
    for (const id of ids) {
      expect(result[id].reasoning).toBe(true);
      expect(result[id].variants).toEqual({
        adaptive: {}, minimal: { reasoningEffort: "low" },
        ...Object.fromEntries(allEfforts.map((effort) => [effort, { reasoningEffort: effort }])),
      });
      expect(result[id].limit).toEqual({ context: 1_000_000, output: 128_000 });
    }
  });

  it.each([
    "anthropic/claude-opus-5-5",
    "openrouter/anthropic/claude-sonnet-5.5",
    "bedrock/us-gov.anthropic.claude-haiku-5-5-v1:0",
  ])("recognizes the native model id %s", (id) => {
    expect(reasoningEfforts({ id })).toEqual(allEfforts);
  });

  it("uses advertised efforts instead of guessing from the model name", () => {
    expect(reasoningEfforts({
      id: "bedrock_mantle/opus-project-anthropic.claude-opus-5-5",
      reasoning: { supported_efforts: [" HIGH ", "low", "high", "not-a-level"] },
    })).toEqual(["high", "low"]);
    expect(reasoningEfforts({
      id: "claude-haiku-5-5",
      reasoning: { supported_efforts: [] },
    })).toEqual([]);
  });

  it("supports arbitrary aliases when Bifrost reports effort metadata", () => {
    expect(reasoningEfforts({
      id: "custom/completely-opaque-alias",
      reasoning: { supported_efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
    })).toEqual(["none", "minimal", ...allEfforts]);
  });

  it("keeps all five Claude levels even when supported_parameters is present", () => {
    expect(reasoningEfforts({ id: "claude-sonnet-5-5", supported_parameters: ["reasoning_effort"] })).toEqual(allEfforts);
    expect(reasoningEfforts({ id: "custom/reasoner", supported_parameters: ["reasoning_effort"] })).toEqual(["low", "medium", "high"]);
  });

  it("prevents OpenCode v1 from reintroducing effort levels excluded by discovery", async () => {
    const result = await toProviderModel({
      id: "claude-opus-5-5", context_length: 1_000_000,
      reasoning: { supported_efforts: ["high"] },
    }, {}, new Map(), await tmpDatasheet());
    expect(result.variants).toEqual({
      adaptive: {}, high: { reasoningEffort: "high" },
      low: { disabled: true }, medium: { disabled: true },
    });
  });

  it("leaves explicit non-reasoning models without any variants", async () => {
    const result = await toProviderModel({
      id: "claude-haiku-5-5", context_length: 1_000_000,
      reasoning: { supported_efforts: [] },
    }, {}, new Map(), await tmpDatasheet());
    expect(result.reasoning).toBe(false);
    expect(result.variants).toEqual({});
  });

  it("preserves native minimal when the gateway explicitly supports it", async () => {
    const result = await toProviderModel({
      id: "claude-sonnet-5-5", context_length: 1_000_000,
      reasoning: { supported_efforts: ["minimal", "low", "medium", "high"] },
    }, {}, new Map(), await tmpDatasheet());
    expect(result.variants?.minimal).toEqual({ reasoningEffort: "minimal" });
  });

  it.each(["openai/gpt-4o", "custom/mystery", "claude-haiku-4-5", "claude-opus-5-50", "claude-opus-5-5-preview"])(
    "does not infer reasoning from unrelated or unknown model %s", (id) => {
      expect(reasoningEfforts({ id })).toEqual([]);
    },
  );
});

describe("toProviderModel context size resolution", () => {
  it("prefers Bifrost's own max_input_tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("should not be called")));
    const model: BifrostModel = { id: "openai/gpt-4o", max_input_tokens: 128000 };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.limit?.context).toBe(128000);
  });

  it("falls back to context_length when max_input_tokens is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("should not be called")));
    const model: BifrostModel = { id: "openai/gpt-4o", context_length: 64000 };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.limit?.context).toBe(64000);
  });

  it("cross-references a sibling model reported by another provider in the same fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("should not be called")));
    const models: BifrostModel[] = [
      { id: "openrouter/kimi-k3", max_input_tokens: 200000 },
      { id: "opencode-go/kimi-k3" },
    ];
    const siblingIndex = buildSiblingContextIndex(models);
    const result = await toProviderModel(models[1], {}, siblingIndex, await tmpDatasheet());
    expect(result.limit?.context).toBe(200000);
  });

  it("falls back to the datasheet when nothing else resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ "meta/llama-3.1-8b": { mode: "chat", max_input_tokens: 131072 } }), { status: 200 }),
      ),
    );
    const model: BifrostModel = { id: "ollama/llama-3.1-8b" };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.limit?.context).toBe(131072);
  });

  it("applies an exact-id override ahead of a provider-prefix override", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = { id: "ollama/llama3.1" };
    const result = await toProviderModel(
      model,
      { "ollama/llama3.1": 16000, ollama: 8000 },
      new Map(),
      await tmpDatasheet(),
    );
    expect(result.limit?.context).toBe(16000);
  });

  it("applies a provider-prefix override when no exact id override exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = { id: "ollama/llama3.1" };
    const result = await toProviderModel(model, { ollama: 8000 }, new Map(), await tmpDatasheet());
    expect(result.limit?.context).toBe(8000);
  });

  it("falls back to a conservative default when nothing resolves", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = { id: "custom/mystery-model" };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.limit?.context).toBe(4096);
  });
});

describe("toProviderModel capabilities", () => {
  it("assumes tool calling when supported_parameters is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = { id: "ollama/llama3.1", max_input_tokens: 8192 };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.tool_call).toBe(true);
  });

  it("derives tool calling from supported_parameters when present", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const withTools: BifrostModel = { id: "a", max_input_tokens: 1, supported_parameters: ["tools"] };
    const withoutTools: BifrostModel = { id: "b", max_input_tokens: 1, supported_parameters: ["temperature"] };
    const datasheet = await tmpDatasheet();
    expect((await toProviderModel(withTools, {}, new Map(), datasheet)).tool_call).toBe(true);
    expect((await toProviderModel(withoutTools, {}, new Map(), datasheet)).tool_call).toBe(false);
  });

  it("derives image input/attachment from architecture.input_modalities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = {
      id: "a",
      max_input_tokens: 1,
      architecture: { input_modalities: ["text", "image"] },
    };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.attachment).toBe(true);
    expect(result.modalities?.input).toEqual(["text", "image"]);
  });

  it("names models as ProviderName: ModelName, ignoring Bifrost's own name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = {
      id: "openrouter/anthropic/claude-haiku-5.5",
      name: "Anthropic: Claude Haiku 5.5",
      max_input_tokens: 1,
    };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.name).toBe("OpenRouter: claude-haiku-5.5");
  });

  it("caps max output tokens to the context window when Bifrost reports neither", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const model: BifrostModel = { id: "a", max_input_tokens: 1000 };
    const result = await toProviderModel(model, {}, new Map(), await tmpDatasheet());
    expect(result.limit?.output).toBe(1000);
  });
});

describe("toProviderModels", () => {
  it("maps every model and keys the result by model id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no datasheet")));
    const models: BifrostModel[] = [
      { id: "openai/gpt-4o", max_input_tokens: 128000 },
      { id: "ollama/llama3.1", max_input_tokens: 8192 },
    ];
    const result = await toProviderModels(models, {}, await tmpDatasheet());
    expect(Object.keys(result)).toEqual(["openai/gpt-4o", "ollama/llama3.1"]);
    expect(result["openai/gpt-4o"].limit?.context).toBe(128000);
  });
});

describe("modelDisplayName", () => {
  it("labels the provider and keeps only the model name", () => {
    expect(modelDisplayName("openrouter/anthropic/claude-haiku-5.5")).toBe("OpenRouter: claude-haiku-5.5");
    expect(modelDisplayName("ollama/Llama3.1")).toBe("Ollama: Llama3.1");
    expect(modelDisplayName("opencode-go/kimi-k3")).toBe("OpenCode Go: kimi-k3");
    expect(modelDisplayName("github-copilot/claude-haiku-4.5")).toBe("GitHub Copilot: claude-haiku-4.5");
    expect(modelDisplayName("bedrock_mantle/some-model")).toBe("Bedrock Mantle: some-model");
  });

  it("shows unknown provider prefixes as they appear in the id", () => {
    expect(modelDisplayName("custom/mystery-model")).toBe("custom: mystery-model");
  });

  it("returns ids with no provider prefix unchanged", () => {
    expect(modelDisplayName("gpt-4o")).toBe("gpt-4o");
  });
});
