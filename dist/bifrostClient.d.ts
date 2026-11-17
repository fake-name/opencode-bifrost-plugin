import type { BifrostConnection, BifrostModel } from "./types.js";
export declare class BifrostApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** Fetches every model Bifrost knows about, across every provider it has configured, paginating as needed. */
export declare function fetchModels(connection: BifrostConnection, signal?: AbortSignal): Promise<BifrostModel[]>;
