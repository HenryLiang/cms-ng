import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  const createDto = (data: any) => plainToInstance(LoginDto, data);

  it('should pass with valid email and password', async () => {
    const dto = createDto({ email: 'test@example.com', password: 'password123' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid email', async () => {
    const dto = createDto({ email: 'not-an-email', password: 'password123' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when email is missing', async () => {
    const dto = createDto({ password: 'password123' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when password is too short', async () => {
    const dto = createDto({ email: 'test@example.com', password: '12345' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('should fail when password is missing', async () => {
    const dto = createDto({ email: 'test@example.com' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
