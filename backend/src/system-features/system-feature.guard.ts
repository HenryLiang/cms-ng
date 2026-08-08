import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getSystemFeatureDefinition,
  isSuperAdminRole,
  SystemFeature,
} from '@cms-ng/shared';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { SYSTEM_FEATURES_KEY } from './system-feature.decorator';
import { SystemFeaturesService } from './system-features.service';

@Injectable()
export class SystemFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: SystemFeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<SystemFeature[]>(
      SYSTEM_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request: { user?: { role?: string } } = context
      .switchToHttp()
      .getRequest();
    for (const feature of required) {
      const definition = getSystemFeatureDefinition(feature);
      if (
        definition.superAdminAlwaysAvailable &&
        isSuperAdminRole(request.user?.role)
      ) {
        return true;
      }
      if (await this.features.isEnabled(feature)) {
        return true;
      }
    }

    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      message: '此功能当前未开放',
      feature: required[0],
    });
  }
}
