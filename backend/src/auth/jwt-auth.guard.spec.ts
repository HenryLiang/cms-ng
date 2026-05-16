import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  const createMockContext = (metadata: any = {}): ExecutionContext =>
    ({
      getHandler: jest.fn().mockReturnValue(metadata.handler),
      getClass: jest.fn().mockReturnValue(metadata.class),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(metadata.request || {}),
      }),
    }) as any;

  describe('canActivate', () => {
    it('should allow public routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(createMockContext());

      expect(result).toBe(true);
    });

    it('should call super.canActivate for non-public routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const superSpy = jest.spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype),
        'canActivate',
      ).mockReturnValue(true);

      const result = guard.canActivate(createMockContext());

      expect(superSpy).toHaveBeenCalled();
      expect(result).toBe(true);

      superSpy.mockRestore();
    });
  });
});
