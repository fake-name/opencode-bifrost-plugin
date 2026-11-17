/**
 * Best-effort lookup against Bifrost's public model registry (getbifrost.ai/datasheet), used to
 * fill in context sizes for models that a given Bifrost instance reports no metadata for (e.g.
 * ollama, custom OpenAI-compatible providers). Matches by base model name only, ignoring which
 * provider the registry happens to list it under, since the same open-weight model is often
 * cataloged under an unrelated host.
 */
export declare class Datasheet {
    private memoryIndex;
    private inFlight;
    private readonly cacheFile;
    constructor(cacheDir?: string);
    /**
     * Resolves quickly from cache when possible. On a cold cache this waits briefly for the
     * (one-time, ~daily) network fetch, then gives up rather than blocking opencode startup — a
     * subsequent opencode session picks up the real value once the cache has warmed.
     */
    lookup(modelId: string): Promise<number | undefined>;
    private getIndexWithBoundedWait;
    private ensureRefreshing;
    private refresh;
    private fetchAndBuildIndex;
    private loadDiskCache;
    private saveDiskCache;
}
