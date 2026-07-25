import { describe, expect, it } from "vitest";
import { getConnection } from "../src/connection.js";

describe("getConnection", () => {
  it("returns undefined when neither env var is set", () => {
    expect(getConnection({})).toBeUndefined();
  });

  it("returns undefined when only baseUrl is set", () => {
    expect(getConnection({ BIFROST_BASE_URL: "https://bifrost.example.com" })).toBeUndefined();
  });

  it("returns undefined when only apiKey is set", () => {
    expect(getConnection({ BIFROST_API_KEY: "secret" })).toBeUndefined();
  });

  it("trims whitespace and trailing slashes from baseUrl", () => {
    const connection = getConnection({
      BIFROST_BASE_URL: "  https://bifrost.example.com///  ",
      BIFROST_API_KEY: "  secret  ",
    });
    expect(connection).toEqual({ baseUrl: "https://bifrost.example.com", apiKey: "secret" });
  });

  it("returns undefined for an invalid baseUrl", () => {
    expect(getConnection({ BIFROST_BASE_URL: "not-a-url", BIFROST_API_KEY: "secret" })).toBeUndefined();
  });

  it("returns undefined when baseUrl or apiKey is blank after trimming", () => {
    expect(getConnection({ BIFROST_BASE_URL: "   ", BIFROST_API_KEY: "secret" })).toBeUndefined();
    expect(getConnection({ BIFROST_BASE_URL: "https://bifrost.example.com", BIFROST_API_KEY: "   " })).toBeUndefined();
  });

  it("falls back to plugin options when env vars are unset", () => {
    const connection = getConnection({}, { baseUrl: "https://bifrost.example.com/", apiKey: "secret" });
    expect(connection).toEqual({ baseUrl: "https://bifrost.example.com", apiKey: "secret" });
  });

  it("prefers env vars over plugin options when both are set", () => {
    const connection = getConnection(
      { BIFROST_BASE_URL: "https://from-env.example.com", BIFROST_API_KEY: "env-secret" },
      { baseUrl: "https://from-options.example.com", apiKey: "options-secret" },
    );
    expect(connection).toEqual({ baseUrl: "https://from-env.example.com", apiKey: "env-secret" });
  });

  it("mixes an env var with a plugin option when only one env var is set", () => {
    const connection = getConnection(
      { BIFROST_BASE_URL: "https://from-env.example.com" },
      { apiKey: "options-secret" },
    );
    expect(connection).toEqual({ baseUrl: "https://from-env.example.com", apiKey: "options-secret" });
  });

  it("returns undefined when neither env vars nor plugin options are set", () => {
    expect(getConnection({}, {})).toBeUndefined();
  });
});
