import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguage } from '@cms-ng/shared';

export class RewriteTextDto {
  @ApiProperty({
    description: 'Source text to be rewritten by the AI',
    example: 'The team announced a new model today.',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Optional natural-language guidance for the rewrite',
    example: 'Make it more engaging and concise',
    required: false,
  })
  @IsString()
  @IsOptional()
  instruction?: string;

  @ApiProperty({
    description: 'Desired writing style for the rewrite',
    enum: ['serious', 'casual', 'academic', 'concise'],
    example: 'serious',
    required: false,
  })
  @IsIn(['serious', 'casual', 'academic', 'concise'])
  @IsOptional()
  style?: 'serious' | 'casual' | 'academic' | 'concise';

  @ApiProperty({
    description: 'Output language for the rewritten text',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ExpandTextDto {
  @ApiProperty({
    description: 'Source text to be expanded with more detail',
    example: 'AI is changing many industries.',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Optional guidance describing what to expand on',
    example: 'Add examples from healthcare and finance',
    required: false,
  })
  @IsString()
  @IsOptional()
  instruction?: string;

  @ApiProperty({
    description: 'Output language for the expanded text',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class CondenseTextDto {
  @ApiProperty({
    description: 'Source text to be condensed',
    example: 'A long paragraph with many details that could be summarized.',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Target maximum character length for the condensed output',
    example: 200,
    required: false,
  })
  @IsInt()
  @IsOptional()
  maxLength?: number;

  @ApiProperty({
    description: 'Output language for the condensed text',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class PolishTextDto {
  @ApiProperty({
    description: 'Source text to polish for grammar, flow, and clarity',
    example: 'The team have made a announcement yesterday.',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Output language for the polished text',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateHeadlinesDto {
  @ApiProperty({
    description: 'Number of headline options to generate',
    example: 5,
    required: false,
  })
  @IsInt()
  @IsOptional()
  count?: number;

  @ApiProperty({
    description: 'Output language for the generated headlines',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateExcerptDto {
  @ApiProperty({
    description: 'Target maximum character length for the excerpt',
    example: 200,
    required: false,
  })
  @IsInt()
  @IsOptional()
  maxLength?: number;

  @ApiProperty({
    description: 'Output language for the excerpt',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ChatMessageDto {
  @ApiProperty({
    description: 'Role of the chat message author',
    enum: ['user', 'assistant'],
    example: 'user',
  })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({
    description: 'Text content of the chat message',
    example: 'Can you summarize the article for me?',
  })
  @IsString()
  content: string;
}

export class ChatWithAIDto {
  @ApiProperty({
    description: 'Ordered list of chat messages forming the conversation',
    type: [ChatMessageDto],
    example: [
      { role: 'user', content: 'What is the tone of this article?' },
    ],
  })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiProperty({
    description: 'Output language for the assistant reply',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateDraftDto {
  @ApiProperty({
    description: 'Optional additional instruction for draft generation',
    example: 'Focus on a neutral, factual tone',
    required: false,
  })
  @IsString()
  @IsOptional()
  instruction?: string;

  @ApiProperty({
    description: 'Output language for the generated draft',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class FactCheckDto {
  @ApiProperty({
    description: 'Output language for the fact-check report',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ReviewReportDto {
  @ApiProperty({
    description: 'Output language for the editorial review report',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class OptimizeSEODto {
  @ApiProperty({
    description: 'Output language for the SEO optimization suggestions',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}
