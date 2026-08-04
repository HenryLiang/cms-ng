/**
 * Provider-agnostic interfaces for LLM chat completion.
 * All providers (DeepSeek, Kimi, OpenAI, etc.) implement these interfaces.
 */
import type { ToolDefinition } from '../tools/tool.interface';

/**
 * Tool sent in the request body. Two shapes are supported:
 *
 *  - `function`  — the standard OpenAI / DeepSeek / Kimi "tools" shape.
 *                  Definition is the project-internal `ToolDefinition`.
 *  - `builtin_function` — a Kimi extension for server-executed tools
 *                  (e.g. `$web_search`).
 *
 * Providers should narrow on `tool.type` before reading `function`.
 */
export type Tool = ToolDefinition | BuiltinFunctionTool;

/**
 * Kimi's proprietary built-in tool shape. Server executes the tool
 * internally; the model only sees the function name and arguments.
 * See: https://platform.kimi.ai/docs/guide/use-web-search
 */
export interface BuiltinFunctionTool {
  type: 'builtin_function';
  function: { name: string };
}

/**
 * A tool call returned by the LLM. Mirrors the OpenAI / DeepSeek /
 * Kimi response shape. `function.arguments` is a JSON-encoded string
 * — callers must JSON.parse it (see OpenAICompatibleProvider).
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Multimodal message content part (OpenAI `image_url` format).
 *
 * `image_url.url` accepts either a public https URL or a base64 data URI
 * (`data:image/png;base64,...`) — all OpenAI-compatible providers
 * (OpenAI / Gemini-compat / Kimi) accept this shape, so the base class
 * can pass messages through unchanged.
 */
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Plain text, or multimodal content parts (text + images) */
  content: string | MessageContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  tools?: Tool[];
  max_tokens?: number;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionProvider {
  readonly providerName: string;
  readonly model: string;

  /** Single-round chat completion */
  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * Multi-round chat completion with tool calling.
   * The provider loops: LLM returns tool_calls → executeTool() → feed results back → repeat.
   */
  chatCompletionWithTools(
    req: ChatCompletionRequest,
    executeTool: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
    maxRounds?: number,
  ): Promise<ChatCompletionResponse>;
}
