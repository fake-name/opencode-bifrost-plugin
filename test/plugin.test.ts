import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Datasheet } from "../src/datasheet.js";
import { createBifrostPlugin } from "../src/plugin.js";

const fakeInput = {} as PluginInput;

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
  originalBaseUrl = process.env.BIFROST_BASE_URL;
  originalApiKey = process.env.BIFROST_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalBaseUrl === undefined) delete process.env.BIFROST_BASE_URL;
  else process.env.BIFROST_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.BIFROST_API_KEY;
  else process.env.BIFROST_API_KEY = originalApiKey;
});

describe("BifrostPlugin config hook", () => {
  it("leaves config untouched when the connection env vars are missing", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider).toBeUndefined();
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
      name: "GPT-4o",
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await expect(hooks.config?.(cfg as any)).resolves.toBeUndefined();

    expect(cfg.provider).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("does not register a provider when Bifrost reports zero models", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const hooks = await testPlugin();
    const cfg: Record<string, unknown> = {};
    await hooks.config?.(cfg as any);

    expect(cfg.provider).toBeUndefined();
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
