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
import { ContentLanguage } from '@cms-ng/shared';

export class RewriteTextDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  instruction?: string;

  @IsIn(['serious', 'casual', 'academic', 'concise'])
  @IsOptional()
  style?: 'serious' | 'casual' | 'academic' | 'concise';

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ExpandTextDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  instruction?: string;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class CondenseTextDto {
  @IsString()
  text: string;

  @IsInt()
  @IsOptional()
  maxLength?: number;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class PolishTextDto {
  @IsString()
  text: string;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateHeadlinesDto {
  @IsInt()
  @IsOptional()
  count?: number;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateExcerptDto {
  @IsInt()
  @IsOptional()
  maxLength?: number;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class ChatWithAIDto {
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class GenerateDraftDto {
  @IsString()
  @IsOptional()
  instruction?: string;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class FactCheckDto {
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class ReviewReportDto {
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}

export class OptimizeSEODto {
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}
