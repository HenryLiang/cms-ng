import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemFeature, UserRole } from '@cms-ng/shared';
import { SystemFeatureGuard } from './system-feature.guard';
import { SystemFeaturesService } from './system-features.service';

describe('SystemFeatureGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const features = { isEnabled: jest.fn() } as unknown as SystemFeaturesService;
  const guard = new SystemFeatureGuard(reflector, features);

  const context = (role: UserRole = UserRole.REPORTER): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'systemFeatures') return [SystemFeature.MEDIA];
        return undefined;
      });
  });

  it('blocks an HTTP entry when its required feature is closed', async () => {
    jest.spyOn(features, 'isEnabled').mockResolvedValue(false);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: {
        code: 'FEATURE_DISABLED',
        message: '此功能当前未开放',
        feature: SystemFeature.MEDIA,
      },
    } satisfies Partial<ForbiddenException>);
  });

  it('keeps the account recovery entry available to SUPER_ADMIN', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'systemFeatures') return [SystemFeature.ACCOUNTS];
        return undefined;
      });
    jest.spyOn(features, 'isEnabled').mockResolvedValue(false);

    await expect(
      guard.canActivate(context(UserRole.SUPER_ADMIN)),
    ).resolves.toBe(true);
    expect(features.isEnabled).not.toHaveBeenCalled();
  });

  it('allows shared HTTP entries when any associated feature is open', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'systemFeatures') {
          return [SystemFeature.ARTICLES, SystemFeature.REVIEW];
        }
        return undefined;
      });
    jest
      .spyOn(features, 'isEnabled')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
});
