import type { Plugin } from "@opencode-ai/plugin";
import { Datasheet } from "./datasheet.js";
/**
 * Registers Bifrost as an opencode provider, discovering its models (and their context sizes)
 * from Bifrost's `/v1/models` endpoint. Connection is read from `BIFROST_BASE_URL` /
 * `BIFROST_API_KEY` env vars, falling back to the `baseUrl`/`apiKey` plugin options when a var
 * isn't set. Discovery runs once per opencode config load (opencode's plugin `config` hook has no
 * way to read back a credential stored via the interactive `/connect` flow).
 *
 * `datasheet` defaults to a fresh `Datasheet()` (the real getbifrost.ai lookup, cached under the
 * OS's default cache dir) but can be overridden - tests pass one pointed at an isolated temp dir
 * via `Datasheet`'s own constructor, rather than this module reaching into the environment.
 */
export declare function createBifrostPlugin(datasheet?: Datasheet): Plugin;
export declare const BifrostPlugin: Plugin;
export default BifrostPlugin;
