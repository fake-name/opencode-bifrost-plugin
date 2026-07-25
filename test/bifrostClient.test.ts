import { afterEach, describe, expect, it, vi } from "vitest";
import { BifrostApiError, fetchModels } from "../src/bifrostClient.js";
import type { BifrostConnection } from "../src/types.js";

const connection: BifrostConnection = { baseUrl: "https://bifrost.example.com", apiKey: "secret-key" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchModels", () => {
  it("sends a bearer token and returns the model list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "openai/gpt-4o" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchModels(connection);

    expect(models).toEqual([{ id: "openai/gpt-4o" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://bifrost.example.com/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
  });

  it("follows pagination via next_page_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "a" }], next_page_token: "page2" }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "b" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchModels(connection);

    expect(models.map((m) => m.id)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("page_token=page2");
  });

  it("throws BifrostApiError on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchModels(connection)).rejects.toBeInstanceOf(BifrostApiError);
  });

  it("treats a missing data array as empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchModels(connection)).resolves.toEqual([]);
  });
});
