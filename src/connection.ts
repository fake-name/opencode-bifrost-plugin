import type { BifrostConnection } from "./types.js";

/**
 * Reads the Bifrost connection from the environment. opencode's plugin `config` hook — the only
 * hook that runs early enough to inject a fully-formed provider before opencode reads its config —
 * has no way to read back a credential stored via opencode's interactive `/connect`/auth flow (the
 * SDK client only exposes `auth.set`, never `auth.get`). Environment variables are therefore the
 * only viable source for discovery-time credentials.
 */
export function getConnection(env: NodeJS.ProcessEnv = process.env): BifrostConnection | undefined {
  const baseUrl = env.BIFROST_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.BIFROST_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    return undefined;
  }
  try {
    new URL(baseUrl);
  } catch {
    return undefined;
  }
  return { baseUrl, apiKey };
}
