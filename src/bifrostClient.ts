import type { BifrostConnection, BifrostModel, BifrostModelsResponse } from "./types.js";

export class BifrostApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message || `Bifrost request failed with status ${status}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

const MODELS_PAGE_SIZE = 200;
const MODELS_HARD_CAP = 10_000;

/** Fetches every model Bifrost knows about, across every provider it has configured, paginating as needed. */
export async function fetchModels(connection: BifrostConnection, signal?: AbortSignal): Promise<BifrostModel[]> {
  const models: BifrostModel[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${connection.baseUrl}/v1/models`);
    url.searchParams.set("page_size", String(MODELS_PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.apiKey}` },
      signal,
    });

    if (!res.ok) {
      throw new BifrostApiError(res.status, await safeText(res));
    }

    const body = (await res.json()) as BifrostModelsResponse;
    models.push(...(body.data ?? []));
    pageToken = body.next_page_token || undefined;
  } while (pageToken && models.length < MODELS_HARD_CAP);

  return models;
}
