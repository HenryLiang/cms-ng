import { Injectable } from '@nestjs/common';
import { ToolDefinition, ToolExecutor } from './tool.interface';
import { TavilySearchTool } from './tavily-search.tool';

@Injectable()
export class AIToolsService {
  private readonly tools = new Map<string, ToolExecutor>();

  constructor(private tavilySearch: TavilySearchTool) {
    this.register(tavilySearch);
  }

  private register(tool: ToolExecutor): void {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
  }

  getToolDefinition(name: string): ToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool ? tool.getDefinition() : undefined;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(args);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
