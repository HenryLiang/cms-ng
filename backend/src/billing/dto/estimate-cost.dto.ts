import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EstimateOperationType {
  AI_LLM = 'AI_LLM',
  AI_IMAGE = 'AI_IMAGE',
  PUBLISH = 'PUBLISH',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
}

export class EstimateCostDto {
  @IsEnum(EstimateOperationType)
  operationType: EstimateOperationType;

  @IsUUID()
  @IsOptional()
  articleId?: string;

  @IsArray()
  @IsOptional()
  platforms?: string[];

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  estimatedTokens?: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  batchSize?: number;
}
