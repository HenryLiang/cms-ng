import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (request: any = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    }) as any;

  describe('canActivate', () => {
    it('should allow public routes', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === 'isPublic') return true;
          return undefined;
        });

      const result = guard.canActivate(createMockContext());

      expect(result).toBe(true);
    });

    it('should allow when no @Roles() decorator', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === 'isPublic') return false;
          if (key === 'roles') return undefined;
          return undefined;
        });

      const result = guard.canActivate(createMockContext());

      expect(result).toBe(true);
    });

    it('should allow when user role matches @Roles()', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === 'isPublic') return false;
          if (key === 'roles') return ['EDITOR', 'ADMIN'];
          return undefined;
        });

      const result = guard.canActivate(
        createMockContext({ user: { role: 'ADMIN' } }),
      );

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user role does not match', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === 'isPublic') return false;
          if (key === 'roles') return ['EDITOR', 'ADMIN'];
          return undefined;
        });

      expect(() =>
        guard.canActivate(createMockContext({ user: { role: 'REPORTER' } })),
      ).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user has no role', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => {
          if (key === 'isPublic') return false;
          if (key === 'roles') return ['EDITOR'];
          return undefined;
        });

      expect(() => guard.canActivate(createMockContext({ user: {} }))).toThrow(
        ForbiddenException,
      );
    });
  });
});
