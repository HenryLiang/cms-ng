import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  Min,
  Max,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { validateCronExpression } from 'cron';
import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguage, Platform, ScheduleType } from '@cms-ng/shared';

/**
 * HH:MM in 24-hour clock.  Hours 00–23, minutes 00–59.
 * Anchored with ^…$ to reject trailing garbage like "9:00 extra".
 */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Custom class-validator decorator for #50: each entry in `times` must be
 * either a `HH:MM` shorthand (legacy) OR a valid 5-field cron expression.
 *
 * Why a custom decorator instead of stacking @Matches + @IsIn: the cron
 * library's `validateCronExpression` is the only thing that knows what a
 * valid cron looks like, and stacking two mutually-exclusive matchers with
 * class-validator's `each: true` would require per-item branching that the
 * built-in decorators don't support cleanly.
 *
 * Failure mode: rejects the request with HTTP 400 (default `each: true` is
 * implied by the array iterate, error message lists the rule).
 */
function IsTimeOrCron(options?: ValidationOptions) {
  return function decorate(target: object, propertyName: string) {
    registerDecorator({
      name: 'isTimeOrCron',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return false;
          return value.every((entry) => {
            if (typeof entry !== 'string' || entry.length === 0) return false;
            if (HHMM_REGEX.test(entry)) return true;
            // Anything not matching HH:MM must be a valid standard cron
            return validateCronExpression(entry).valid;
          });
        },
        defaultMessage(): string {
          return 'each `times` entry must be HH:MM (00:00–23:59) or a valid 5-field cron expression';
        },
      },
    });
  };
}

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
  @ApiProperty({
    description: 'List of trigger times. Each entry is either HH:MM (00:00–23:59) or a valid 5-field cron expression',
    example: ['09:00', '0 18 * * *'],
    type: [String],
  })
  @IsTimeOrCron()
  times: string[];

  @ApiProperty({
    description: 'IANA timezone in which the schedule is evaluated',
    enum: ALLOWED_TIMEZONES as unknown as string[],
    example: 'Asia/Hong_Kong',
  })
  @IsIn(ALLOWED_TIMEZONES as unknown as string[])
  timezone: string;
}

export class TopicStrategyDto {
  @ApiProperty({
    description: 'Fixed keyword list used to pick topics',
    example: ['AI regulation', 'climate tech'],
    type: [String],
  })
  @IsString({ each: true })
  fixedKeywords: string[];

  @ApiProperty({
    description: 'When true, mix in trending topics alongside the fixed keywords',
    example: true,
    required: false,
  })
  @IsOptional()
  useTrending?: boolean;

  @ApiProperty({
    description: 'Source identifiers to pull trending topics from',
    example: ['google-trends', 'rss:bbc'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  trendingSources?: string[];
}

export class ContentConfigDto {
  @ApiProperty({
    description: 'Writing style preset for content generation',
    example: 'neutral',
  })
  @IsString()
  style: string;

  @ApiProperty({
    description: 'Maximum length (in characters) of generated content',
    example: 1200,
    minimum: 100,
    maximum: 5000,
  })
  @IsInt()
  @Min(100)
  @Max(5000)
  maxLength: number;

  @ApiProperty({
    description: 'Language the generated content is written in',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
  })
  @IsEnum(ContentLanguage)
  language: ContentLanguage;

  @ApiProperty({
    description: 'Optional override of the system prompt used for content generation',
    example: 'You are a newsroom assistant...',
    required: false,
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiProperty({
    description:
      'Optional author persona slug (e.g. "author-luxun") from data/authors/. When set, auto-published drafts adopt that author\'s voice.',
    example: 'author-luxun',
    required: false,
  })
  @IsOptional()
  @IsString()
  authorSlug?: string;
}

export class FilterConfigDto {
  @ApiProperty({
    description: 'Categories to exclude from auto-publish',
    example: ['opinion'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  blockedCategories?: string[];

  @ApiProperty({
    description: 'Keywords that disqualify a topic from auto-publish',
    example: ['sponsored'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  blockedKeywords?: string[];

  @ApiProperty({
    description: 'Restrict publishing to these channels only',
    example: ['website', 'wordpress'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  allowedChannels?: string[];
}

export class PublishConfigDto {
  @ApiProperty({
    description: 'Target platform for auto-published articles',
    enum: Platform,
    example: Platform.WEBSITE,
  })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({
    description: 'UUID of the WordPress site to publish to (when platform is WordPress)',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
    required: false,
  })
  @IsOptional()
  @IsString()
  wordpressSiteId?: string;

  @ApiProperty({
    description: 'WordPress category slug to assign the post to',
    example: 'news',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    description: 'WordPress post status to apply (publish, draft, pending, etc.)',
    example: 'publish',
    required: false,
  })
  @IsOptional()
  @IsString()
  postStatus?: string;
}

export class RetryConfigDto {
  @ApiProperty({
    description: 'Maximum number of retry attempts on failure',
    example: 2,
    minimum: 0,
    maximum: 5,
  })
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries: number;

  @ApiProperty({
    description: 'Delay between retry attempts in milliseconds',
    example: 5000,
    minimum: 1000,
    maximum: 300000,
  })
  @IsInt()
  @Min(1000)
  @Max(300000)
  retryDelayMs: number;
}

export class CreateTaskDto {
  @ApiProperty({
    description: 'Human-readable task name',
    example: 'Daily AI news auto-publish',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Optional longer description of the task',
    example: 'Picks top AI stories each morning and publishes to the website',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'How the task is scheduled',
    enum: ScheduleType,
    example: ScheduleType.FIXED_TIME,
    required: false,
  })
  @IsOptional()
  @IsEnum(ScheduleType)
  scheduleType?: ScheduleType;

  @ApiProperty({
    description: 'Schedule configuration (times + timezone)',
    type: () => ScheduleConfigDto,
    example: { times: ['09:00'], timezone: 'Asia/Hong_Kong' },
  })
  @ValidateNested()
  @Type(() => ScheduleConfigDto)
  scheduleConfig: ScheduleConfigDto;

  @ApiProperty({
    description: 'How topics are selected for this task',
    type: () => TopicStrategyDto,
    example: { fixedKeywords: ['AI'], useTrending: true },
  })
  @ValidateNested()
  @Type(() => TopicStrategyDto)
  topicStrategy: TopicStrategyDto;

  @ApiProperty({
    description: 'Content generation parameters',
    type: () => ContentConfigDto,
    example: { style: 'neutral', maxLength: 1000, language: 'ENGLISH' },
  })
  @ValidateNested()
  @Type(() => ContentConfigDto)
  contentConfig: ContentConfigDto;

  @ApiProperty({
    description: 'Optional content filters',
    type: () => FilterConfigDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FilterConfigDto)
  filterConfig?: FilterConfigDto;

  @ApiProperty({
    description: 'Publishing target configuration',
    type: () => PublishConfigDto,
    example: { platform: 'WEBSITE' },
  })
  @ValidateNested()
  @Type(() => PublishConfigDto)
  publishConfig: PublishConfigDto;

  @ApiProperty({
    description: 'Number of articles to generate per run',
    example: 5,
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  batchSize?: number;

  @ApiProperty({
    description: 'Retry policy applied to failed runs',
    required: false,
    type: () => RetryConfigDto,
  })
  @IsOptional()
  @IsObject()
  retryConfig?: RetryConfigDto;
}
