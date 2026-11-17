import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { slugifyModelId } from "./modelSlug.js";
const DATASHEET_URL = "https://getbifrost.ai/datasheet/model-parameters";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const INLINE_WAIT_MS = 8_000;
function defaultCacheDir() {
    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "opencode-bifrost-plugin", "cache");
    }
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches", "opencode-bifrost-plugin");
    }
    return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "opencode-bifrost-plugin");
}
/**
 * Best-effort lookup against Bifrost's public model registry (getbifrost.ai/datasheet), used to
 * fill in context sizes for models that a given Bifrost instance reports no metadata for (e.g.
 * ollama, custom OpenAI-compatible providers). Matches by base model name only, ignoring which
 * provider the registry happens to list it under, since the same open-weight model is often
 * cataloged under an unrelated host.
 */
export class Datasheet {
    memoryIndex;
    inFlight;
    cacheFile;
    constructor(cacheDir = defaultCacheDir()) {
        this.cacheFile = path.join(cacheDir, "datasheet-index.json");
    }
    /**
     * Resolves quickly from cache when possible. On a cold cache this waits briefly for the
     * (one-time, ~daily) network fetch, then gives up rather than blocking opencode startup — a
     * subsequent opencode session picks up the real value once the cache has warmed.
     */
    async lookup(modelId) {
        const index = await this.getIndexWithBoundedWait();
        return index?.entries[slugifyModelId(modelId)];
    }
    async getIndexWithBoundedWait() {
        if (this.memoryIndex && Date.now() - this.memoryIndex.fetchedAt < CACHE_TTL_MS) {
            return this.memoryIndex;
        }
        const refresh = this.ensureRefreshing();
        const timedOut = new Promise((resolve) => setTimeout(() => resolve(undefined), INLINE_WAIT_MS));
        const result = await Promise.race([refresh, timedOut]);
        return result ?? this.memoryIndex;
    }
    ensureRefreshing() {
        if (!this.inFlight) {
            this.inFlight = this.refresh().finally(() => {
                this.inFlight = undefined;
            });
        }
        return this.inFlight;
    }
    async refresh() {
        const cached = this.memoryIndex ?? (await this.loadDiskCache());
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            this.memoryIndex = cached;
            return cached;
        }
        try {
            const fresh = await this.fetchAndBuildIndex();
            this.memoryIndex = fresh;
            // Awaited (not fire-and-forget): the plugin process running this is short-lived, so a
            // detached write could be abandoned before it lands on disk.
            await this.saveDiskCache(fresh);
            return fresh;
        }
        catch {
            // Fall back to a stale on-disk cache rather than nothing at all.
            this.memoryIndex = cached;
            return cached;
        }
    }
    async fetchAndBuildIndex() {
        const res = await fetch(DATASHEET_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) {
            throw new Error(`Bifrost datasheet fetch failed: ${res.status}`);
        }
        const raw = (await res.json());
        const entries = {};
        for (const [key, value] of Object.entries(raw)) {
            if (value.mode !== "chat" || !value.max_input_tokens) {
                continue;
            }
            const slug = slugifyModelId(key);
            entries[slug] = Math.max(entries[slug] ?? 0, value.max_input_tokens);
        }
        return { fetchedAt: Date.now(), entries };
    }
    async loadDiskCache() {
        try {
            const bytes = await readFile(this.cacheFile, "utf8");
            return JSON.parse(bytes);
        }
        catch {
            return undefined;
        }
    }
    async saveDiskCache(index) {
        try {
            await mkdir(path.dirname(this.cacheFile), { recursive: true });
            await writeFile(this.cacheFile, JSON.stringify(index));
        }
        catch {
            // Non-fatal: worst case we refetch next time.
        }
    }
}
//# sourceMappingURL=datasheet.js.map