/**
 * Provider-agnostic interfaces for LLM chat completion.
 * All providers (DeepSeek, Kimi, OpenAI, etc.) implement these interfaces.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  tools?: any[];
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
  toolCalls?: any[];
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
