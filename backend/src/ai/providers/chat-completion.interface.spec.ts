import type { ToolDefinition } from '../tools/tool.interface';
import type {
  BuiltinFunctionTool,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  Tool,
  ToolCall,
} from './chat-completion.interface';

describe('chat-completion.interface (types)', () => {
  describe('ToolCall', () => {
    it('accepts a standard OpenAI function tool call', () => {
      const tc: ToolCall = {
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'tavily_search',
          arguments: '{"query":"latest news"}',
        },
      };
      expect(tc.id).toBe('call_abc123');
      expect(tc.type).toBe('function');
      expect(tc.function.name).toBe('tavily_search');
      expect(tc.function.arguments).toBe('{"query":"latest news"}');
    });
  });

  describe('Tool (discriminated union)', () => {
    it('accepts a ToolDefinition (standard function tool)', () => {
      const toolDef: ToolDefinition = {
        type: 'function',
        function: {
          name: 'tavily_search',
          description: 'web search',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      };
      const tool: Tool = toolDef;
      expect(tool.type).toBe('function');
    });

    it('accepts a BuiltinFunctionTool (Kimi extension)', () => {
      const builtin: BuiltinFunctionTool = {
        type: 'builtin_function',
        function: { name: '$web_search' },
      };
      const tool: Tool = builtin;
      expect(tool.type).toBe('builtin_function');
      if (tool.type === 'builtin_function') {
        expect(tool.function.name).toBe('$web_search');
      }
    });
  });

  describe('ChatMessage', () => {
    it('accepts an assistant message with tool_calls', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'tavily_search', arguments: '{}' },
          },
        ],
      };
      expect(msg.tool_calls).toHaveLength(1);
    });

    it('accepts a tool result message', () => {
      const msg: ChatMessage = {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'tavily_search',
        content: '{"results":[]}',
      };
      expect(msg.role).toBe('tool');
      expect(msg.tool_call_id).toBe('call_1');
    });

    it('accepts a system/user/assistant message without tool fields', () => {
      const system: ChatMessage = { role: 'system', content: 'be helpful' };
      const user: ChatMessage = { role: 'user', content: 'hi' };
      const assistant: ChatMessage = { role: 'assistant', content: 'hello' };
      expect([system, user, assistant]).toHaveLength(3);
    });
  });

  describe('ChatCompletionRequest', () => {
    it('accepts tools as a mixed array (function + builtin)', () => {
      const req: ChatCompletionRequest = {
        messages: [{ role: 'user', content: 'search for x' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'tavily_search',
              description: 'web search',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
              },
            },
          },
          {
            type: 'builtin_function',
            function: { name: '$web_search' },
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      };
      expect(req.tools).toHaveLength(2);
    });

    it('accepts a request without tools (plain chat)', () => {
      const req: ChatCompletionRequest = {
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.7,
      };
      expect(req.tools).toBeUndefined();
    });
  });

  describe('ChatCompletionResponse', () => {
    it('accepts a response with toolCalls', () => {
      const resp: ChatCompletionResponse = {
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'tavily_search', arguments: '{}' },
          },
        ],
        finishReason: 'tool_calls',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
      expect(resp.toolCalls).toHaveLength(1);
      expect(resp.finishReason).toBe('tool_calls');
    });

    it('accepts a response without toolCalls (plain text)', () => {
      const resp: ChatCompletionResponse = {
        content: 'Hello!',
        finishReason: 'stop',
      };
      expect(resp.toolCalls).toBeUndefined();
    });
  });
});
