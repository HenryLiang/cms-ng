import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

describe('RefreshTokenDto (issue #49)', () => {
  it('accepts a non-empty token string', async () => {
    const dto = plainToInstance(RefreshTokenDto, { token: 'a'.repeat(20) });
    const errors = await validate(dto as object);
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty token (MinLength 10)', async () => {
    const dto = plainToInstance(RefreshTokenDto, { token: '' });
    const errors = await validate(dto as object);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => /token/.test(m) || /length/i.test(m))).toBe(
      true,
    );
  });

  it('rejects a non-string token', async () => {
    const dto = plainToInstance(RefreshTokenDto, { token: 123 });
    const errors = await validate(dto as object);
    expect(errors.length).toBeGreaterThan(0);
  });
});
