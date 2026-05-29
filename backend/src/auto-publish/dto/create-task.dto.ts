import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleType } from '@cms-ng/shared';

export class ScheduleConfigDto {
  @IsString({ each: true })
  times: string[];

  @IsString()
  timezone: string;
}

export class TopicStrategyDto {
  @IsString({ each: true })
  fixedKeywords: string[];

  @IsOptional()
  useTrending?: boolean;

  @IsOptional()
  @IsString({ each: true })
  trendingSources?: string[];
}

export class ContentConfigDto {
  @IsString()
  style: string;

  @IsInt()
  @Min(100)
  @Max(5000)
  maxLength: number;

  @IsString()
  language: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;
}

export class FilterConfigDto {
  @IsOptional()
  @IsString({ each: true })
  blockedCategories?: string[];

  @IsOptional()
  @IsString({ each: true })
  blockedKeywords?: string[];

  @IsOptional()
  @IsString({ each: true })
  allowedChannels?: string[];
}

export class PublishConfigDto {
  @IsString()
  platform: string;

  @IsOptional()
  @IsString()
  wordpressSiteId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  postStatus?: string;
}

export class RetryConfigDto {
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries: number;

  @IsInt()
  @Min(1000)
  @Max(300000)
  retryDelayMs: number;
}

export class CreateTaskDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ScheduleType)
  scheduleType?: ScheduleType;

  @IsObject()
  @Type(() => ScheduleConfigDto)
  scheduleConfig: ScheduleConfigDto;

  @IsObject()
  @Type(() => TopicStrategyDto)
  topicStrategy: TopicStrategyDto;

  @IsObject()
  @Type(() => ContentConfigDto)
  contentConfig: ContentConfigDto;

  @IsOptional()
  @IsObject()
  filterConfig?: FilterConfigDto;

  @IsObject()
  @Type(() => PublishConfigDto)
  publishConfig: PublishConfigDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  batchSize?: number;

  @IsOptional()
  @IsObject()
  retryConfig?: RetryConfigDto;
}
