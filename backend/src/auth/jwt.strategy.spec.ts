import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('test-secret') } as any;
    strategy = new JwtStrategy(config as ConfigService);
  });

  describe('validate', () => {
    it('should return user object from payload', async () => {
      const payload = { sub: 'user-id', email: 'test@example.com', role: 'REPORTER' };

      const result = await strategy.validate(payload);

      expect(result).toEqual({ userId: 'user-id', email: 'test@example.com', role: 'REPORTER' });
    });
  });
});
