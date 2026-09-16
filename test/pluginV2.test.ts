import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "@opencode/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Datasheet } from "../src/datasheet.js";
import { createBifrostSetup } from "../src/pluginV2.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

type Added = Parameters<Parameters<Plugin.Context["provider"]["transform"]>[0]>[0] extends {
  add: (input: infer T) => void;
}
  ? T
  : never;

/**
 * Stands in for the v2 plugin context, recording what the setup contributes. Only the two members
 * the setup actually touches are implemented; everything else would fail loudly if it were used.
 */
function fakeContext(options: Record<string, unknown> = {}) {
  const added: Added[] = [];
  const transform = vi.fn(async (callback: (editor: any) => void) => {
    callback({
      add: (input: Added) => added.push(input),
      list: () => [],
      get: () => undefined,
      update: () => {},
      remove: () => {},
      models: { set: () => {}, update: () => {}, remove: () => {} },
    });
    return { dispose: async () => {} };
  });
  const ctx = { options, provider: { transform } } as unknown as Plugin.Context;
  return { ctx, added, transform };
}

async function runSetup(options?: Record<string, unknown>) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "bifrost-plugin-v2-test-"));
  const fake = fakeContext(options);
  await createBifrostSetup(new Datasheet(cacheDir))(fake.ctx);
  return fake;
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

describe("BifrostPlugin v2 setup", () => {
  it("contributes nothing when the connection env vars are missing", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    const { transform } = await runSetup();

    expect(transform).not.toHaveBeenCalled();
  });

  it("adds a bifrost provider with discovered models when configured", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com/";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [{ id: "openai/gpt-4o", name: "GPT-4o", max_input_tokens: 128000, max_output_tokens: 16384 }],
        }),
      ),
    );

    const { added } = await runSetup();

    expect(added).toHaveLength(1);
    expect(added[0].info).toMatchObject({
      id: "bifrost",
      name: "Bifrost",
      activation: "enabled",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://bifrost.example.com/v1", apiKey: "virtual-key" },
    });
    expect(added[0].models).toHaveLength(1);
    expect(added[0].models[0]).toMatchObject({
      id: "openai/gpt-4o",
      modelID: "openai/gpt-4o",
      providerID: "bifrost",
      name: "GPT-4o",
      limit: { context: 128000, output: 16384 },
    });
  });

  it("maps Bifrost capabilities onto the v2 capabilities shape", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: "openrouter/vision",
              max_input_tokens: 1000,
              supported_parameters: ["tools"],
              architecture: { input_modalities: ["text", "image"] },
            },
            { id: "openrouter/no-tools", max_input_tokens: 1000, supported_parameters: ["temperature"] },
          ],
        }),
      ),
    );

    const { added } = await runSetup();
    const [vision, noTools] = added[0].models;

    expect(vision.capabilities).toEqual({ tools: true, input: ["text", "image"], output: ["text"] });
    expect(noTools.capabilities).toEqual({ tools: false, input: ["text"], output: ["text"] });
  });

  it("does not throw and contributes nothing when discovery fails", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { transform } = await runSetup();

    expect(transform).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("does not add a provider when Bifrost reports zero models", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const { transform } = await runSetup();

    expect(transform).not.toHaveBeenCalled();
  });

  it("falls back to baseUrl/apiKey plugin options when env vars are unset", async () => {
    delete process.env.BIFROST_BASE_URL;
    delete process.env.BIFROST_API_KEY;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "openai/gpt-4o" }] })));

    const { added } = await runSetup({ baseUrl: "https://bifrost.example.com", apiKey: "virtual-key" });

    expect(added[0].info.settings).toEqual({
      baseURL: "https://bifrost.example.com/v1",
      apiKey: "virtual-key",
    });
  });

  it("passes contextSizeOverrides from plugin options through to the mapped models", async () => {
    process.env.BIFROST_BASE_URL = "https://bifrost.example.com";
    process.env.BIFROST_API_KEY = "virtual-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "ollama/llama3.1" }] })));

    const { added } = await runSetup({ contextSizeOverrides: { ollama: 16384 } });

    expect(added[0].models[0].limit.context).toBe(16384);
  });
});
