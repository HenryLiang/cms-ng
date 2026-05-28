import { ConfigService } from '@nestjs/config';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from './chat-completion.interface';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

/**
 * Kimi provider — OpenAI-compatible API with built-in web search support.
 * Supports the proprietary `builtin_function: $web_search` tool type.
 * Models: kimi-for-coding, kimi-k2.6 (k2.6 forces temperature=1).
 */
export class KimiProvider extends OpenAICompatibleProvider {
  readonly providerName = 'kimi';

  constructor(config: ConfigService) {
    const model = config.get<string>('KIMI_MODEL') || 'kimi-for-coding';
    const defaultTemp = model === 'kimi-k2.6' ? 1 : undefined;
    super(
      config.get<string>('KIMI_API_KEY') || '',
      config.get<string>('KIMI_API_BASE') || 'https://api.kimi.com/coding/v1',
      model,
      defaultTemp,
    );
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
    const builtinTools = [
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

      // Echo back tool arguments as content (Kimi handles execution server-side)
      const toolMessages: ChatMessage[] = choice.message.tool_calls.map(
        (tc: any) => ({
          role: 'tool' as const,
          tool_call_id: tc.id,
          name: tc.function.name,
          content: tc.function.arguments,
        }),
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
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
