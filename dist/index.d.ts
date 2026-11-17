import { Plugin } from "@opencode/plugin";
/**
 * One entrypoint for both opencode plugin APIs. opencode v1 calls `server()` and uses the hooks it
 * returns; opencode v2 reads `id` and `setup()` and ignores `server`. The two implementations share
 * discovery and model mapping but nothing else - v2 does not translate v1 hooks.
 */
declare const _default: {
    server: import("@opencode-ai/plugin").Plugin;
    id: string;
    setup: (context: Plugin.Context) => Promise<Plugin.Cleanup | void> | Plugin.Cleanup | void;
};
export default _default;
export { BifrostPlugin, createBifrostPlugin } from "./plugin.js";
export { createBifrostSetup } from "./pluginV2.js";
