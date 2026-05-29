import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Mock Redis as unavailable for unit tests
    mockConfig.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  describe('isAvailable', () => {
    it('should return false when REDIS_URL is not configured', () => {
      expect(service.isAvailable).toBe(false);
    });
  });

  describe('acquireLock', () => {
    it('should return true (fail open) when Redis is unavailable', async () => {
      const result = await service.acquireLock('test-key', 60);
      expect(result).toBe(true);
    });
  });

  describe('releaseLock', () => {
    it('should not throw when Redis is unavailable', async () => {
      await expect(service.releaseLock('test-key')).resolves.toBeUndefined();
    });
  });

  describe('get', () => {
    it('should return null when Redis is unavailable', async () => {
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should not throw when Redis is unavailable', async () => {
      await expect(service.set('test-key', 'value')).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should not throw when Redis is unavailable', async () => {
      await expect(service.del('test-key')).resolves.toBeUndefined();
    });
  });
});
