import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  const createDto = (data: any) => plainToInstance(RegisterDto, data);

  it('should pass with valid data', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'REPORTER',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid email', async () => {
    const dto = createDto({
      email: 'bad',
      name: 'Test',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when name is too short', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'A',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when password is too short', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'Test',
      password: '12345',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('should allow optional role to be omitted', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail with invalid role enum', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
      role: 'INVALID_ROLE',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});
