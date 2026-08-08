import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SystemFeatureGuard } from './system-feature.guard';
import { SystemFeaturesController } from './system-features.controller';
import { SystemFeaturesService } from './system-features.service';

@Global()
@Module({
  controllers: [SystemFeaturesController],
  providers: [
    SystemFeaturesService,
    {
      provide: APP_GUARD,
      useClass: SystemFeatureGuard,
    },
  ],
  exports: [SystemFeaturesService],
})
export class SystemFeaturesModule {}
