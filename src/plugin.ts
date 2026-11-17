import type { Hooks, Plugin, PluginOptions } from "@opencode-ai/plugin";
import { fetchModels } from "./bifrostClient.js";
import { getConnection } from "./connection.js";
import { Datasheet } from "./datasheet.js";
import { toProviderModels } from "./modelMapping.js";
import type { BifrostPluginOptions } from "./types.js";

const DISCOVERY_TIMEOUT_MS = 30_000;

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
export function createBifrostPlugin(datasheet: Datasheet = new Datasheet()): Plugin {
  return async (_input, options?: PluginOptions) => {
    const pluginOptions = options as BifrostPluginOptions | undefined;
    const config: Hooks["config"] = async (cfg) => {
      const connection = getConnection(process.env, pluginOptions);
      if (!connection) {
        // Not configured - leave opencode's config untouched rather than registering an empty provider.
        console.warn("[bifrost] not configured: set a valid HTTP(S) baseUrl (or baseURL) and apiKey in plugin options, or BIFROST_BASE_URL and BIFROST_API_KEY.");
        return;
      }

      let models;
      try {
        console.error("[bifrost] discovering models from the configured gateway...");
        models = await fetchModels(connection, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS));
      } catch (err) {
        console.error(`[bifrost] failed to discover models: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (models.length === 0) {
        console.warn("[bifrost] discovery returned no models; check the virtual key's model access in Bifrost.");
        return;
      }

      const overrides = pluginOptions?.contextSizeOverrides ?? {};
      const mapped = await toProviderModels(models, overrides, datasheet);

      cfg.provider ??= {};
      cfg.provider.bifrost = {
        name: "Bifrost",
        npm: "@ai-sdk/openai-compatible",
        options: {
          baseURL: `${connection.baseUrl}/v1`,
          apiKey: connection.apiKey,
        },
        models: mapped,
      };
      console.error(`[bifrost] registered ${models.length} models.`);
    };

    return { config };
  };
}

export const BifrostPlugin: Plugin = createBifrostPlugin();

export default BifrostPlugin;
