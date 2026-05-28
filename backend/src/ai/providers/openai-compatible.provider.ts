import axios from 'axios';
import { Logger } from '@nestjs/common';
import {
  ChatCompletionProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from './chat-completion.interface';

/**
 * Shared base class for OpenAI-compatible API providers (DeepSeek, Kimi, OpenAI, etc.).
 * Handles HTTP calls, response parsing, and multi-round tool calling loops.
 * Subclasses override hooks for provider-specific behavior.
 */
export abstract class OpenAICompatibleProvider implements ChatCompletionProvider {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly apiKey: string,
    protected readonly apiBase: string,
    readonly model: string,
    protected readonly defaultTemperature?: number,
  ) {}

  abstract readonly providerName: string;

  /** Hook: modify request body before sending (e.g., inject provider-specific fields) */
  protected prepareRequestBody(body: Record<string, any>): Record<string, any> {
    return body;
  }

  async chatCompletion(
    req: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const body = this.buildBody(req);
    const response = await this.postChatCompletions(body);
    return this.parseResponse(response.data);
  }

  async chatCompletionWithTools(
    req: ChatCompletionRequest,
    executeTool: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
    maxRounds = 3,
  ): Promise<ChatCompletionResponse> {
    let currentMessages: ChatMessage[] = [...req.messages];

    for (let round = 0; round < maxRounds; round++) {
      const body = this.buildBody({
        ...req,
        messages: currentMessages,
        response_format: undefined, // tool calling conflicts with response_format
      });
      const response = await this.postChatCompletions(body);
      const choice = response.data.choices?.[0];

      if (!choice || choice.finish_reason !== 'tool_calls') {
        return this.parseResponse(response.data);
      }

      // Execute tools locally
      const toolResults: ChatMessage[] = [];
      for (const tc of choice.message.tool_calls || []) {
        const toolName = tc.function?.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          // ignore parse errors, use empty args
        }

        let result: unknown;
        try {
          result = await executeTool(toolName, toolArgs);
        } catch (error: any) {
          result = { error: error.message };
        }

        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolName,
          content: JSON.stringify(result),
        });
      }

      // Build next round messages
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
        reasoning_content: choice.message.reasoning_content || '',
      };

      currentMessages = [
        ...currentMessages,
        assistantMessage,
        ...toolResults,
      ];
    }

    // Max rounds reached, do one final call without tools
    const finalBody = this.buildBody({ ...req, messages: currentMessages });
    const finalResponse = await this.postChatCompletions(finalBody);
    return this.parseResponse(finalResponse.data);
  }

  /** Build the request body with model, messages, temperature, tools */
  protected buildBody(req: ChatCompletionRequest): Record<string, any> {
    const body: Record<string, any> = {
      model: this.model,
      messages: req.messages,
      temperature: this.resolveTemperature(req.temperature),
    };

    if (req.response_format) {
      body.response_format = req.response_format;
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }
    if (req.max_tokens) {
      body.max_tokens = req.max_tokens;
    }

    return this.prepareRequestBody(body);
  }

  /** Send the HTTP request to the chat completions endpoint */
  protected async postChatCompletions(body: Record<string, any>): Promise<any> {
    return axios.post(`${this.apiBase}/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000,
    });
  }

  /** Parse the raw API response into ChatCompletionResponse */
  protected parseResponse(data: any): ChatCompletionResponse {
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      reasoningContent: choice?.message?.reasoning_content || '',
      toolCalls: choice?.message?.tool_calls,
      finishReason: choice?.finish_reason || 'stop',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  /** Resolve temperature: use provider default if set, otherwise use caller's value */
  protected resolveTemperature(preferred?: number): number {
    return this.defaultTemperature ?? preferred ?? 0.7;
  }
}
