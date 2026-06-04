import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ContentLanguage, Platform, ScheduleType } from '@cms-ng/shared';
import {
  ContentConfigDto,
  CreateTaskDto,
  PublishConfigDto,
  ScheduleConfigDto,
} from './create-task.dto';

/**
 * Helper: convert a plain object into a DTO instance and run validation.
 * Mirrors the NestJS ValidationPipe flow (class-transformer + class-validator).
 */
async function validateDto<T extends object>(
  DtoClass: new () => T,
  plain: Record<string, unknown>,
): Promise<ValidationError[]> {
  const instance = plainToInstance(DtoClass, plain, { enableImplicitConversion: false });
  return validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
}

const baseCreatePayload = {
  name: 'Test Task',
  scheduleType: ScheduleType.FIXED_TIME,
  scheduleConfig: { times: ['08:00'], timezone: 'Asia/Hong_Kong' },
  topicStrategy: { fixedKeywords: ['test'], useTrending: false },
  contentConfig: {
    style: 'news',
    maxLength: 800,
    language: ContentLanguage.SIMPLIFIED_CHINESE,
  },
  publishConfig: { platform: Platform.WORDPRESS },
};

describe('CreateTaskDto — #46 ContentConfigDto.language @IsEnum', () => {
  it('rejects an invalid language code', async () => {
    const errors = await validateDto(ContentConfigDto, {
      style: 'news',
      maxLength: 800,
      language: 'KLINGON',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /language/.test(m) || /ContentLanguage/.test(m))).toBe(true);
  });

  it('accepts every valid ContentLanguage value', async () => {
    for (const lang of Object.values(ContentLanguage)) {
      const errors = await validateDto(ContentConfigDto, {
        style: 'news',
        maxLength: 800,
        language: lang,
      });
      expect(errors).toHaveLength(0);
    }
  });
});

describe('CreateTaskDto — #47 PublishConfigDto.platform @IsEnum', () => {
  it('rejects an invalid platform name', async () => {
    const errors = await validateDto(PublishConfigDto, {
      platform: 'NOT_A_PLATFORM',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /platform/.test(m) || /Platform/.test(m))).toBe(true);
  });

  it('accepts every valid Platform value', async () => {
    for (const platform of Object.values(Platform)) {
      const errors = await validateDto(PublishConfigDto, { platform });
      expect(errors).toHaveLength(0);
    }
  });
});

describe('CreateTaskDto — #53 ScheduleConfigDto.timezone @IsIn allowed list', () => {
  it('rejects a fake timezone that would crash cron-jobs at runtime', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['08:00'],
      timezone: 'Fake/Zone',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /timezone/.test(m))).toBe(true);
  });

  it('accepts every timezone in the allowlist', async () => {
    const allowlist = [
      'UTC',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Singapore',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Asia/Tokyo',
    ];
    for (const tz of allowlist) {
      const errors = await validateDto(ScheduleConfigDto, {
        times: ['08:00'],
        timezone: tz,
      });
      expect(errors).toHaveLength(0);
    }
  });
});

describe('CreateTaskDto — #57 ScheduleConfigDto.times per-item HH:MM', () => {
  it('rejects hour out of range (25:00)', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['25:00'],
      timezone: 'Asia/Hong_Kong',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /times/.test(m))).toBe(true);
  });

  it('rejects garbage suffix (9:00 extra)', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['9:00 extra'],
      timezone: 'Asia/Hong_Kong',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /times/.test(m))).toBe(true);
  });

  it('rejects negative hour (-1:30)', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['-1:30'],
      timezone: 'Asia/Hong_Kong',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /times/.test(m))).toBe(true);
  });

  it('accepts the standard HH:MM form', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['08:00', '12:30', '23:59', '00:00'],
      timezone: 'Asia/Hong_Kong',
    });
    expect(errors).toHaveLength(0);
  });
});

describe('CreateTaskDto — full happy path (regression guard)', () => {
  it('accepts a well-formed CreateTaskDto payload', async () => {
    const errors = await validateDto(CreateTaskDto, baseCreatePayload);
    expect(errors).toHaveLength(0);
  });
});

describe('CreateTaskDto — #50 ScheduleConfigDto.times accepts standard cron (issue #50)', () => {
  it('accepts a standard 5-field cron expression (every 5 minutes)', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['*/5 * * * *'],
      timezone: 'UTC',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a mixed list of HH:MM and standard cron entries', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['08:00', '*/15 * * * *', '23:30'],
      timezone: 'Asia/Hong_Kong',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed cron expression', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['bogus cron'],
      timezone: 'UTC',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /times/.test(m))).toBe(true);
  });

  it('rejects non-string entries (numbers, null, empty)', async () => {
    for (const bad of [123 as unknown, null as unknown, '' as unknown]) {
      const errors = await validateDto(ScheduleConfigDto, {
        times: [bad],
        timezone: 'UTC',
      });
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a cron with out-of-range values (60 in minute field)', async () => {
    const errors = await validateDto(ScheduleConfigDto, {
      times: ['60 * * * *'],
      timezone: 'UTC',
    });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /times/.test(m))).toBe(true);
  });

  it('accepts the CreateTaskDto with cron times (end-to-end shape)', async () => {
    const errors = await validateDto(CreateTaskDto, {
      ...baseCreatePayload,
      scheduleType: ScheduleType.CRON,
      scheduleConfig: { times: ['*/5 * * * *'], timezone: 'UTC' },
    });
    expect(errors).toHaveLength(0);
  });
});
