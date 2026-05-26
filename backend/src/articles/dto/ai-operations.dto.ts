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

export class RewriteTextDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  instruction?: string;

  @IsIn(['serious', 'casual', 'academic', 'concise'])
  @IsOptional()
  style?: 'serious' | 'casual' | 'academic' | 'concise';
}

export class ExpandTextDto {
  @IsString()
  text: string;

  @IsString()
  @IsOptional()
  instruction?: string;
}

export class CondenseTextDto {
  @IsString()
  text: string;

  @IsInt()
  @IsOptional()
  maxLength?: number;
}

export class PolishTextDto {
  @IsString()
  text: string;
}

export class GenerateHeadlinesDto {
  @IsInt()
  @IsOptional()
  count?: number;
}

export class GenerateExcerptDto {
  @IsInt()
  @IsOptional()
  maxLength?: number;
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
}

export class GenerateDraftDto {
  @IsString()
  @IsOptional()
  instruction?: string;
}

export class FactCheckDto {}

export class ReviewReportDto {}

export class OptimizeSEODto {}
