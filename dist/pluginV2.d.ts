import { Plugin } from "@opencode/plugin";
import { Datasheet } from "./datasheet.js";
export declare const PROVIDER_ID = "bifrost";
/**
 * opencode v2 ships its own OpenAI-compatible provider package rather than resolving `npm` entries
 * from config the way v1 did, so v2 registers the same gateway under this built-in id.
 */
export declare const PROVIDER_PACKAGE = "@opencode/ai/providers/openai-compatible";
/**
 * Registers Bifrost as an opencode v2 provider. v2 has no mutable global config object, so instead
 * of v1's `config` hook this contributes the provider and its models through `ctx.provider`.
 * Connection and options are read exactly as in v1 — `BIFROST_BASE_URL` / `BIFROST_API_KEY`,
 * falling back to the `baseUrl`/`apiKey` plugin options.
 *
 * Discovery runs once per plugin load. `ctx.provider.reload()` would replay the transform, but the
 * inventory it captured wouldn't change without re-fetching, so there is nothing to reload against.
 */
export declare function createBifrostSetup(datasheet?: Datasheet): Plugin.Plugin["setup"];
