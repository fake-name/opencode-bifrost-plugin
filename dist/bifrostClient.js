export class BifrostApiError extends Error {
    status;
    constructor(status, message) {
        super(message || `Bifrost request failed with status ${status}`);
        this.status = status;
    }
}
async function safeText(res) {
    try {
        return await res.text();
    }
    catch {
        return res.statusText;
    }
}
const MODELS_PAGE_SIZE = 200;
const MODELS_HARD_CAP = 10_000;
/** Fetches every model Bifrost knows about, across every provider it has configured, paginating as needed. */
export async function fetchModels(connection, signal) {
    const models = [];
    let pageToken;
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
        const body = (await res.json());
        models.push(...(body.data ?? []));
        pageToken = body.next_page_token || undefined;
    } while (pageToken && models.length < MODELS_HARD_CAP);
    return models;
}
//# sourceMappingURL=bifrostClient.js.map