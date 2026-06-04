import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContentLanguage, Platform, ScheduleType } from '@cms-ng/shared';

/**
 * HH:MM in 24-hour clock.  Hours 00–23, minutes 00–59.
 * Anchored with ^…$ to reject trailing garbage like "9:00 extra".
 */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Allowlist of IANA timezones the auto-publish scheduler is allowed to use.
 *
 * We intentionally keep this a small, curated subset rather than using
 * `Intl.supportedValuesOf('timeZone')` (the host runtime may differ from
 * production) or hardcoding the full 400+ IANA list (a maintenance burden).
 *
 * Why DTO-level validation matters: `new CronJob(expr, undefined, false, tz)`
 * throws `RangeError: Invalid IANA timezone` for unknown zones, and that
 * happens AFTER the DTO has been accepted, so we have to reject bad zones
 * here — otherwise a single bad request can crash the scheduler worker.
 *
 * If your deployment needs a zone not on this list, add it explicitly.
 */
const ALLOWED_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
] as const;

export class ScheduleConfigDto {
  @IsString({ each: true })
  @Matches(HHMM_REGEX, { each: true, message: 'times must be HH:MM in 24h format (00:00–23:59)' })
  times: string[];

  @IsIn(ALLOWED_TIMEZONES as unknown as string[])
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

  @IsEnum(ContentLanguage)
  language: ContentLanguage;

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
  @IsEnum(Platform)
  platform: Platform;

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
