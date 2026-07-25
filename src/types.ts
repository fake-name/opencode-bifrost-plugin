export interface BifrostConnection {
  baseUrl: string;
  apiKey: string;
}

export interface BifrostModelArchitecture {
  modality?: string;
  tokenizer?: string;
  instruct_type?: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface BifrostModel {
  id: string;
  name?: string;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  architecture?: BifrostModelArchitecture;
  supported_parameters?: string[];
}

export interface BifrostModelsResponse {
  data: BifrostModel[];
  next_page_token?: string;
}

/**
 * Options accepted via opencode.json's plugin array, e.g.
 * `"plugin": [["opencode-bifrost-plugin", { "contextSizeOverrides": { "ollama": 8192 } }]]`
 */
export interface BifrostPluginOptions {
  /**
   * Corrects context size when Bifrost (and the public datasheet fallback) don't report one.
   * Keys can be an exact model id (e.g. "ollama/llama3.1") or a provider prefix (e.g. "ollama").
   * Values are the model's max input tokens.
   */
  contextSizeOverrides?: Record<string, number>;
}
