import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Datasheet } from "../src/datasheet.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function tmpCacheDir() {
  return mkdtemp(path.join(os.tmpdir(), "bifrost-datasheet-test-"));
}

describe("Datasheet", () => {
  it("looks up a model by its slugified id and only keeps chat-mode entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        "openrouter/meta-llama/llama-3.1-8b": { mode: "chat", max_input_tokens: 131072 },
        "some/embedding-model": { mode: "embedding", max_input_tokens: 8192 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const datasheet = new Datasheet(await tmpCacheDir());

    expect(await datasheet.lookup("ollama/llama-3.1-8b")).toBe(131072);
    expect(await datasheet.lookup("provider/embedding-model")).toBeUndefined();
  });

  it("takes the max across duplicate slugs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        "a/model-x": { mode: "chat", max_input_tokens: 8192 },
        "b/model-x": { mode: "chat", max_input_tokens: 32768 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const datasheet = new Datasheet(await tmpCacheDir());

    expect(await datasheet.lookup("c/model-x")).toBe(32768);
  });

  it("caches in memory and does not refetch for a second lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "a/model-x": { mode: "chat", max_input_tokens: 4096 } }));
    vi.stubGlobal("fetch", fetchMock);

    const datasheet = new Datasheet(await tmpCacheDir());
    await datasheet.lookup("model-x");
    await datasheet.lookup("model-x");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persists to disk and a fresh instance reads from disk without refetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "a/model-x": { mode: "chat", max_input_tokens: 4096 } }));
    vi.stubGlobal("fetch", fetchMock);

    const dir = await tmpCacheDir();
    await new Datasheet(dir).lookup("model-x");

    const cacheFile = path.join(dir, "datasheet-index.json");
    const raw = JSON.parse(await readFile(cacheFile, "utf8"));
    expect(raw.entries["model-x"]).toBe(4096);

    const secondFetch = vi.fn();
    vi.stubGlobal("fetch", secondFetch);
    const result = await new Datasheet(dir).lookup("model-x");

    expect(result).toBe(4096);
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it("falls back to a stale disk cache when the network fetch fails", async () => {
    const dir = await tmpCacheDir();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "a/model-x": { mode: "chat", max_input_tokens: 4096 } }));
    vi.stubGlobal("fetch", fetchMock);
    await new Datasheet(dir).lookup("model-x");

    const failingFetch = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", failingFetch);
    const datasheet = new Datasheet(dir);
    // Force staleness by making the instance believe the disk cache is old: simulate by writing directly.
    const cacheFile = path.join(dir, "datasheet-index.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(cacheFile, JSON.stringify({ fetchedAt: 0, entries: { "model-x": 4096 } }));

    const result = await datasheet.lookup("model-x");
    expect(result).toBe(4096);
  });

  it("resolves undefined when there is no cache and the network fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const datasheet = new Datasheet(await tmpCacheDir());

    await expect(datasheet.lookup("anything")).resolves.toBeUndefined();
  });
});
