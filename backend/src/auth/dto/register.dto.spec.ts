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

  // issue #105 — role was removed from the DTO entirely: public registration
  // must not accept a client-supplied role (mass assignment). There is no
  // `role` validator on the DTO anymore, and at the HTTP layer the global
  // ValidationPipe(whitelist) strips the field before it reaches the
  // service; the service itself forces REPORTER (covered in
  // auth.service.spec.ts).
  it('should have no role validation rules (field removed from the contract)', async () => {
    const dto = createDto({
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
      role: 'ADMIN',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(errors.some((e) => e.property === 'role')).toBe(false);
  });
});
