import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';

@Module({
  providers: [AIService, AIToolsService, TavilySearchTool],
  exports: [AIService, AIToolsService],
})
export class AIModule {}
