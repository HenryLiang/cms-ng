import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum EstimateOperationType {
  AI_LLM = 'AI_LLM',
  AI_IMAGE = 'AI_IMAGE',
  PUBLISH = 'PUBLISH',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
}

export class EstimateCostDto {
  @ApiProperty({
    description: 'Type of operation whose cost is being estimated',
    enum: EstimateOperationType,
    example: EstimateOperationType.AI_LLM,
  })
  @IsEnum(EstimateOperationType)
  operationType: EstimateOperationType;

  @ApiProperty({
    description: 'UUID of the article the estimate is associated with, if any',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  articleId?: string;

  @ApiProperty({
    description: 'List of platform identifiers the cost is being estimated for (publish operations)',
    example: ['WEBSITE', 'XIAOHONGSHU'],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  platforms?: string[];

  @ApiProperty({
    description: 'Estimated token usage (used for AI_LLM operations)',
    example: 1500,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  estimatedTokens?: number;

  @ApiProperty({
    description: 'Number of items in the batch (used for AUTO_PUBLISH operations)',
    example: 5,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  batchSize?: number;
}
