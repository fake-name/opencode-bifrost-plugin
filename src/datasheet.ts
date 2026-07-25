import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { slugifyModelId } from "./modelSlug.js";

const DATASHEET_URL = "https://getbifrost.ai/datasheet/model-parameters";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const INLINE_WAIT_MS = 8_000;

interface DatasheetIndex {
  fetchedAt: number;
  /** Lowercased last path segment of a model id -> best-known max input tokens. */
  entries: Record<string, number>;
}

interface RawDatasheetEntry {
  mode?: string;
  max_input_tokens?: number;
}

function defaultCacheDir(): string {
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
  private memoryIndex: DatasheetIndex | undefined;
  private inFlight: Promise<DatasheetIndex | undefined> | undefined;
  private readonly cacheFile: string;

  constructor(cacheDir: string = defaultCacheDir()) {
    this.cacheFile = path.join(cacheDir, "datasheet-index.json");
  }

  /**
   * Resolves quickly from cache when possible. On a cold cache this waits briefly for the
   * (one-time, ~daily) network fetch, then gives up rather than blocking opencode startup — a
   * subsequent opencode session picks up the real value once the cache has warmed.
   */
  async lookup(modelId: string): Promise<number | undefined> {
    const index = await this.getIndexWithBoundedWait();
    return index?.entries[slugifyModelId(modelId)];
  }

  private async getIndexWithBoundedWait(): Promise<DatasheetIndex | undefined> {
    if (this.memoryIndex && Date.now() - this.memoryIndex.fetchedAt < CACHE_TTL_MS) {
      return this.memoryIndex;
    }

    const refresh = this.ensureRefreshing();
    const timedOut = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), INLINE_WAIT_MS));
    const result = await Promise.race([refresh, timedOut]);
    return result ?? this.memoryIndex;
  }

  private ensureRefreshing(): Promise<DatasheetIndex | undefined> {
    if (!this.inFlight) {
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async refresh(): Promise<DatasheetIndex | undefined> {
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
    } catch {
      // Fall back to a stale on-disk cache rather than nothing at all.
      this.memoryIndex = cached;
      return cached;
    }
  }

  private async fetchAndBuildIndex(): Promise<DatasheetIndex> {
    const res = await fetch(DATASHEET_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Bifrost datasheet fetch failed: ${res.status}`);
    }
    const raw = (await res.json()) as Record<string, RawDatasheetEntry>;

    const entries: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value.mode !== "chat" || !value.max_input_tokens) {
        continue;
      }
      const slug = slugifyModelId(key);
      entries[slug] = Math.max(entries[slug] ?? 0, value.max_input_tokens);
    }

    return { fetchedAt: Date.now(), entries };
  }

  private async loadDiskCache(): Promise<DatasheetIndex | undefined> {
    try {
      const bytes = await readFile(this.cacheFile, "utf8");
      return JSON.parse(bytes) as DatasheetIndex;
    } catch {
      return undefined;
    }
  }

  private async saveDiskCache(index: DatasheetIndex): Promise<void> {
    try {
      await mkdir(path.dirname(this.cacheFile), { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify(index));
    } catch {
      // Non-fatal: worst case we refetch next time.
    }
  }
}
