import { ConfigService } from '@nestjs/config';
import {
  BuiltinFunctionTool,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ToolCall,
} from './chat-completion.interface';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import type { ProviderOverrides } from './provider-overrides';

/**
 * Kimi provider — OpenAI-compatible API with built-in web search support.
 * Supports the proprietary `builtin_function: $web_search` tool type.
 * Models: kimi-for-coding, kimi-k2.6 (temperature is always forced to 1).
 */
export class KimiProvider extends OpenAICompatibleProvider {
  readonly providerName = 'kimi';

  constructor(config: ConfigService, overrides?: ProviderOverrides) {
    const model =
      overrides?.model || config.get<string>('KIMI_MODEL') || 'kimi-for-coding';
    super(
      config.get<string>('KIMI_API_KEY') || '',
      overrides?.apiBase ||
        config.get<string>('KIMI_API_BASE') ||
        'https://api.kimi.com/coding/v1',
      model,
      1,
      overrides?.requestTimeoutMs,
    );
  }

  /**
   * The Kimi coding endpoint only accepts temperature=1 and rejects any other
   * value with 400 invalid_request_error, so callers' temperature preferences
   * are clamped away here instead of failing the whole request.
   */
  protected prepareRequestBody(body: Record<string, any>): Record<string, any> {
    return { ...body, temperature: 1 };
  }

  /**
   * Kimi built-in web search via `builtin_function: $web_search`.
   * The server executes the search internally; tool results are echoed back as-is.
   * See: https://platform.kimi.ai/docs/guide/use-web-search
   */
  async chatCompletionWithBuiltinSearch(
    req: ChatCompletionRequest,
    maxRounds = 3,
  ): Promise<ChatCompletionResponse> {
    const builtinTools: BuiltinFunctionTool[] = [
      { type: 'builtin_function', function: { name: '$web_search' } },
    ];

    let currentMessages: ChatMessage[] = [...req.messages];

    for (let round = 0; round < maxRounds; round++) {
      const body = this.buildBody({
        ...req,
        messages: currentMessages,
        tools: builtinTools,
        response_format: undefined, // conflicts with tool calling
      });
      const response = await this.postChatCompletions(body);
      const choice = response.data.choices?.[0];

      if (!choice || choice.finish_reason !== 'tool_calls') {
        return this.parseResponse(response.data);
      }

      // Echo back tool arguments as content (Kimi handles execution server-side).
      // Cast at HTTP boundary — see OpenAICompatibleProvider for the rationale.
      const toolCalls: ToolCall[] = choice.message.tool_calls ?? [];
      const toolMessages: ChatMessage[] = toolCalls.map((tc) => ({
        role: 'tool' as const,
        tool_call_id: tc.id,
        name: tc.function.name,
        content: tc.function.arguments,
      }));

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: toolCalls,
        reasoning_content: choice.message.reasoning_content || '',
      };

      currentMessages = [...currentMessages, assistantMessage, ...toolMessages];
    }

    // Max rounds reached
    const finalBody = this.buildBody({ ...req, messages: currentMessages });
    const finalResponse = await this.postChatCompletions(finalBody);
    return this.parseResponse(finalResponse.data);
  }
}
