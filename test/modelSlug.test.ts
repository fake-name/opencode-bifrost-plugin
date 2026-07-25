import { describe, expect, it } from "vitest";
import { slugifyModelId } from "../src/modelSlug.js";

describe("slugifyModelId", () => {
  it("returns the last path segment, lowercased", () => {
    expect(slugifyModelId("openrouter/moonshotai/kimi-k3")).toBe("kimi-k3");
    expect(slugifyModelId("opencode-go/kimi-k3")).toBe("kimi-k3");
  });

  it("passes through ids with no provider prefix", () => {
    expect(slugifyModelId("gpt-4o")).toBe("gpt-4o");
  });

  it("lowercases mixed-case ids", () => {
    expect(slugifyModelId("ollama/Llama3.1")).toBe("llama3.1");
  });
});
