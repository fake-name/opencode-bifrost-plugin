import { Provider } from "@opencode/plugin";
import { fetchModels } from "./bifrostClient.js";
import { getConnection } from "./connection.js";
import { Datasheet } from "./datasheet.js";
import { resolveModels } from "./modelMapping.js";
import { toModelInfo } from "./modelMappingV2.js";
const DISCOVERY_TIMEOUT_MS = 30_000;
export const PROVIDER_ID = "bifrost";
/**
 * opencode v2 ships its own OpenAI-compatible provider package rather than resolving `npm` entries
 * from config the way v1 did, so v2 registers the same gateway under this built-in id.
 */
export const PROVIDER_PACKAGE = "@opencode/ai/providers/openai-compatible";
/**
 * Registers Bifrost as an opencode v2 provider. v2 has no mutable global config object, so instead
 * of v1's `config` hook this contributes the provider and its models through `ctx.provider`.
 * Connection and options are read exactly as in v1 — `BIFROST_BASE_URL` / `BIFROST_API_KEY`,
 * falling back to the `baseUrl`/`apiKey` plugin options.
 *
 * Discovery runs once per plugin load. `ctx.provider.reload()` would replay the transform, but the
 * inventory it captured wouldn't change without re-fetching, so there is nothing to reload against.
 */
export function createBifrostSetup(datasheet = new Datasheet()) {
    return async (ctx) => {
        const options = ctx.options;
        const connection = getConnection(process.env, options);
        if (!connection) {
            // Not configured - contribute nothing rather than registering an empty provider.
            return;
        }
        let models;
        try {
            models = await fetchModels(connection, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS));
        }
        catch (err) {
            console.error(`[bifrost] failed to discover models: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        if (models.length === 0) {
            return;
        }
        const resolved = await resolveModels(models, options?.contextSizeOverrides ?? {}, datasheet);
        const providerID = Provider.ID.make(PROVIDER_ID);
        const mapped = resolved.map((model) => toModelInfo(providerID, model));
        await ctx.provider.transform((editor) => {
            editor.add({
                info: {
                    ...Provider.Info.empty(providerID),
                    name: "Bifrost",
                    activation: "enabled",
                    package: PROVIDER_PACKAGE,
                    settings: {
                        baseURL: `${connection.baseUrl}/v1`,
                        apiKey: connection.apiKey,
                    },
                },
                models: mapped,
            });
        });
    };
}
//# sourceMappingURL=pluginV2.js.map