export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolExecutor {
  readonly name: string;
  getDefinition(): ToolDefinition;
  execute(args: Record<string, unknown>): Promise<unknown>;
}
