import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Datasheet } from "../src/datasheet.js";
import { createBifrostPlugin } from "../src/plugin.js";

const hostLog = vi.fn();
const fakeInput = { client: { app: { log: hostLog } } } as unknown as PluginInput;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function testPlugin(options?: Record<string, unknown>) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "bifrost-plugin-test-"));
  const hooks = await createBifrostPlugin(new Datasheet(cacheDir))(fakeInput, options);
  return hooks;
}

let originalBaseUrl: string | undefined;
let originalApiKey: string | undefined;

beforeEach(() => {
  hostLog.mockReset().mockResolvedValue({});
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  originalBaseUrl = process.env.BIFROST_BASE_URL;
  originalApiKey = process.env.BIFROST_API_KEY;
});

afterEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    expect(console[method]).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalBaseUrl === undefined) delete process.env.BIFROST_BASE_URL;
  else process.env.BIFROST_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.BIFROST_API_KEY;
  else process.env.BIFROST_API_KEY = originalApiKey;
});

describe("BifrostPlugin config hook", () => {
  it("keeps repeated successful config loads silent", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({
      data: [{ id: "anthropic.claude-opus-5-5", context_length: 1_000_000, max_output_tokens: 128_000 }],
    }))));
    const hooks = await testPlugin();
    for (let i = 0; i < 3; i++) {
      const cfg: Record<string, any> = {};
      await hooks.config?.(cfg as any);
      expect(cfg.provider.bifrost.models["anthropic.claude-opus-5-5"]).toBeDefined();
    }
    expect(hostLog).not.toHaveBeenCalled();
  });

  it("registers Claude 5.5 thinking choices for project aliases using JSON plugin options", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    const ids = ["opus", "sonnet", "haiku"].map((family) =>
      `bedrock_mantle/${family}-charge-number-anthropic.claude-${family}-5-5`,
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: ids.map((id) => ({ id, context_length: 1_000_000, max_output_tokens: 128_000 })),
    })));
    const hooks = await testPlugin({ baseUrl: "http://localhost:8080", apiKey: "test-virtual-key" });
    const cfg: Record<string, any> = {};
    await hooks.config?.(cfg as any);
    expect(Object.keys(cfg.provider.bifrost.models)).toEqual(ids);
    for (const id of ids) {
      expect(cfg.provider.bifrost.models[id]).toMatchObject({
        reasoning: true, limit: { context: 1_000_000, output: 128_000 },
      });
      expect(cfg.provider.bifrost.models[id].variants).toEqual({
        adaptive: {}, minimal: { reasoningEffort: "low" },
        ...Object.fromEntries(["low", "medium", "high", "xhigh", "max"].map((effort) => [effort, { reasoningEffort: effort }])),
      });
    }
  });

  it("leaves config untouched when the connection env vars are missing", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider).toBeUndefined();
    expect(hostLog).toHaveBeenCalledWith({ body: {
      service: "bifrost", level: "warn", message: expect.stringContaining("not configured"),
    } });
  });

  it("registers a bifrost provider with discovered models when configured", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com/";
    process.env.BIFROST_API_KEY = "virtual-key";

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/models")) {
        return Promise.resolve(
          jsonResponse({
            data: [{ id: "openai/gpt-4o", name: "GPT-4o", max_input_tokens: 128000, max_output_tokens: 16384 }],
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const hooks = await testPlugin();
    const cfg: Record<string, any> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider.bifrost.npm).toBe("@ai-sdk/openai-compatible");
    expect(cfg.provider.bifrost.options).toEqual({
      baseURL: "https://bifrost.example.com/v1",
      apiKey: "virtual-key",
    });
    expect(cfg.provider.bifrost.models["openai/gpt-4o"]).toMatchObject({
      name: "OpenAI: gpt-4o",
      limit: { context: 128000, output: 16384 },
    });
  });

  it("preserves existing provider config entries", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "a/b" }] })));

    const hooks = await testPlugin();
    const cfg: Record<string, any> = { provider: { other: { name: "Other" } } };
    await hooks.config?.(cfg as any);

    expect(cfg.provider.other).toEqual({ name: "Other" });
    expect(cfg.provider.bifrost).toBeDefined();
  });

  it("does not throw and leaves config untouched when discovery fails", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await expect(hooks.config?.(cfg as any)).resolves.toBeUndefined();

    expect(cfg.provider).toBeUndefined();
    expect(hostLog).toHaveBeenCalledWith({ body: {
      service: "bifrost", level: "error", message: "failed to discover models: connection refused",
    } });
  });

  it("redacts the virtual key from discovery failure logs", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rejected virtual-key")));
    const hooks = await testPlugin();
    await hooks.config?.({});
    expect(hostLog).toHaveBeenCalledWith({ body: {
      service: "bifrost", level: "error", message: "failed to discover models: rejected [redacted]",
    } });
  });

  it.each(["reject", "throw", "pending"])("tolerates a host logger that will %s without terminal output", async (behavior) => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    hostLog.mockImplementation(() => {
      if (behavior === "throw") throw new Error("logger unavailable");
      if (behavior === "reject") return Promise.reject(new Error("logger unavailable"));
      return new Promise(() => {});
    });
    const hooks = await testPlugin();
    await expect(hooks.config?.({})).resolves.toBeUndefined();
    expect(hostLog).toHaveBeenCalledOnce();
  });

  it("does not register a provider when Bifrost reports zero models", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider).toBeUndefined();
    expect(hostLog).toHaveBeenCalledWith({ body: {
      service: "bifrost", level: "warn", message: expect.stringContaining("discovery returned no models"),
    } });
  });

  it("falls back to baseUrl/apiKey plugin options when env vars are unset", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "openai/gpt-4o" }] })));

    const hooks = await testPlugin({ baseUrl: "https://bifrost.example.com", apiKey: "virtual-key" });
    const cfg: Record<string, any> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider.bifrost.options).toEqual({
      baseURL: "https://bifrost.example.com/v1",
      apiKey: "virtual-key",
    });
  });

  it("passes contextSizeOverrides from plugin options through to the mapped models", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "ollama/llama3.1" }] })));

    const hooks = await testPlugin({ contextSizeOverrides: { ollama: 16384 } });
    const cfg: Record<string, any> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider.bifrost.models["ollama/llama3.1"].limit.context).toBe(16384);
  });
});
