import type { BifrostConnection, BifrostPluginOptions } from "./types.js";
/**
 * Reads the Bifrost connection from the environment, falling back to the `baseUrl`/`apiKey`
 * plugin options when the corresponding env var isn't set. opencode's plugin `config` hook — the
 * only hook that runs early enough to inject a fully-formed provider before opencode reads its
 * config — has no way to read back a credential stored via opencode's interactive `/connect`/auth
 * flow (the SDK client only exposes `auth.set`, never `auth.get`). Environment variables are
 * therefore the recommended source for discovery-time credentials; plugin options exist as a
 * fallback for setups that can't use env vars (e.g. some GUI opencode front-ends).
 */
export declare function getConnection(env?: NodeJS.ProcessEnv, options?: BifrostPluginOptions): BifrostConnection | undefined;
