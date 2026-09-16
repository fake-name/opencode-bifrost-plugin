import { Plugin } from "@opencode/plugin";
import { BifrostPlugin } from "./plugin.js";
import { createBifrostSetup } from "./pluginV2.js";

/**
 * One entrypoint for both opencode plugin APIs. opencode v1 calls `server()` and uses the hooks it
 * returns; opencode v2 reads `id` and `setup()` and ignores `server`. The two implementations share
 * discovery and model mapping but nothing else - v2 does not translate v1 hooks.
 */
export default {
  ...Plugin.define({
    id: "bifrost",
    setup: createBifrostSetup(),
  }),
  server: BifrostPlugin,
};

export { BifrostPlugin, createBifrostPlugin } from "./plugin.js";
export { createBifrostSetup } from "./pluginV2.js";
